import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import Group from "../models/group.model.js";

import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import { analyzeToxicity, analyzeKeywordToxicity, analyzeTextToxicity, analyzeTextToxicityWithEnhancedSentiment, getEnhancedSentiment } from "../lib/toxicity.js";
import e2eEncryption from "../lib/encryption.js";
import { encryptCaesar, decryptCaesar } from "../lib/caesarCipher.js";

export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const loggedInUserEmail = req.user.email;

    if (loggedInUserEmail === "bey@email.com") {
      // Admin: return all users except self
      const filteredUsers = await User.find({ _id: { $ne: loggedInUserId } }).select("-password");
      return res.status(200).json(filteredUsers);
    }

    // Non-admin: return only friends
    const user = await User.findById(loggedInUserId).populate('friends', '-password');
    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json(user.friends);
  } catch (error) {
    console.error("Error in getUsersForSidebar: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const { groupId } = req.query;
    const myId = req.user._id;

    let messages;
    if (groupId) {
      messages = await Message.find({ groupId })
        .populate("senderId", "fullName profilePic email")
        .populate({
          path: "replyTo",
          populate: {
            path: "senderId",
            select: "fullName profilePic email",
          },
        })
        .sort({ createdAt: 1 });
    } else {
      messages = await Message.find({
        $or: [
          { senderId: myId, receiverId: userToChatId },
          { senderId: userToChatId, receiverId: myId },
        ],
      })
        .populate("senderId", "fullName profilePic email")
        .populate("receiverId", "fullName profilePic email")
        .populate({
          path: "replyTo",
          populate: {
            path: "senderId",
            select: "fullName profilePic email",
          },
        })
        .sort({ createdAt: 1 });
    }

    // ✅ AUTO-DECRYPT MESSAGES using Caesar cipher
    const decryptedMessages = messages.map(message => {
      const messageObj = message.toObject();
      
      // Decrypt text if it's encrypted
      if (messageObj.isEncrypted && messageObj.text) {
        messageObj.text = decryptCaesar(messageObj.text);
        messageObj.isDecryptedForDisplay = true;
      }
      
      return messageObj;
    });

    res.status(200).json(decryptedMessages);
  } catch (error) {
    console.error("Error in getMessages controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, image, groupId, sentiment, replyTo, selectedModel } = req.body;
    const receiverId = req.params.id;
    const senderId = req.user._id;

    console.log("📨 sendMessage called:", { text, receiverId, groupId, selectedModel });

    // Analyze sentiment and toxicity
    let analysisResult;
    try {
      console.log("🔍 Analyzing sentiment...");
      analysisResult = await analyzeTextToxicityWithEnhancedSentiment(text, selectedModel || 'svc');
      console.log("✅ Analysis complete:", analysisResult.sentiment.value);
    } catch (error) {
      console.error("❌ Sentiment analysis failed:", error);
      analysisResult = {
        sentiment: { 
          value: sentiment || "neutral", 
          confidence: 0, 
          score: 0, 
          source: "fallback", 
          wordAnalysis: [], 
          enhanced: false 
        },
        toxicity: { 
          isToxic: false, 
          toxicityScore: 0, 
          severity: "none", 
          categories: [] 
        },
        sentimentOverridden: false
      };
    }

    const finalSentiment = analysisResult.sentiment.value;

    // ✅ ENCRYPT MESSAGE using Caesar cipher with key=4
    const encryptedText = text ? encryptCaesar(text) : null;
    console.log(`🔐 Caesar cipher encryption (key=4):`);
    console.log(`   Original: "${text}"`);
    console.log(`   Encrypted: "${encryptedText}"`);

    // Create message object
    const messageData = {
      senderId,
      text: encryptedText, // ✅ Store encrypted text
      image: image || null,
      sentiment: finalSentiment,
      sentimentAnalysis: analysisResult.sentiment,
      sentimentOverridden: analysisResult.sentimentOverridden || false,
      toxicity: analysisResult.toxicity,
      replyTo: replyTo || null,
      isEncrypted: true,
      encryptionMethod: 'caesar',
      encryptionKey: 4
    };

    // Add receiverId or groupId
    if (groupId) {
      messageData.groupId = groupId;
    } else {
      messageData.receiverId = receiverId;
    }

    const newMessage = new Message(messageData);
    await newMessage.save();

    console.log("✅ Message saved successfully (encrypted)");

    // Populate for response
    await newMessage.populate("senderId", "fullName profilePic email");
    if (receiverId) {
      await newMessage.populate("receiverId", "fullName profilePic email");
    }
    if (replyTo) {
      await newMessage.populate({
        path: "replyTo",
        populate: { path: "senderId", select: "fullName profilePic email" }
      });
    }

    const messageForSocket = newMessage.toObject();
    
    // ✅ DECRYPT for socket emission
    if (messageForSocket.isEncrypted && messageForSocket.text) {
      messageForSocket.text = decryptCaesar(messageForSocket.text);
      messageForSocket.isDecryptedForDisplay = true;
      console.log(`🔓 Decrypted for socket: "${messageForSocket.text}"`);
    }

    // ✅ EMIT SOCKET EVENTS - Only emit ONCE per message
    if (groupId) {
      console.log("📡 Emitting newMessage to group:", groupId);
      io.to(groupId.toString()).emit("newMessage", messageForSocket);
    } else {
      // Emit to receiver
      const receiverSocketId = getReceiverSocketId(receiverId);
      console.log("📡 Receiver socket ID:", receiverSocketId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("newMessage", messageForSocket);
        console.log("✅ Socket event emitted to receiver");
      }
      
      // Emit to sender (so they see their own message in real-time)
      const senderSocketId = getReceiverSocketId(senderId.toString());
      if (senderSocketId) {
        io.to(senderSocketId).emit("newMessage", messageForSocket);
        console.log("✅ Socket event emitted to sender");
      }
    }

    // Return the decrypted message
    res.status(201).json(messageForSocket);
  } catch (error) {
    console.error("❌ sendMessage error:", error);
    console.error("❌ Error stack:", error.stack);
    res.status(500).json({ 
      message: error.message || "Internal Server Error",
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Make sure all other functions have complete try-catch blocks
// Check around line 317 for any incomplete blocks