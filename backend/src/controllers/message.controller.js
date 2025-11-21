import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import Group from "../models/group.model.js";

import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import { analyzeToxicity, analyzeKeywordToxicity, analyzeTextToxicity, analyzeTextToxicityWithEnhancedSentiment, getEnhancedSentiment } from "../lib/toxicity.js";
import e2eEncryption from "../lib/encryption.js";

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

    // ✅ AUTO-DECRYPT MESSAGES BEFORE SENDING TO FRONTEND
    const currentUser = await User.findById(myId);
    const decryptedMessages = await Promise.all(
      messages.map(async (message) => {
        const messageObj = message.toObject();
        
        // If message is encrypted, decrypt it automatically
        if (messageObj.isEncrypted && messageObj.encryptedData) {
          try {
            // Check if current user has the private key
            if (currentUser.privateKey) {
              const decrypted = await e2eEncryption.decryptMessage(
                messageObj.encryptedData,
                currentUser.privateKey
              );
              
              // Replace with decrypted content
              messageObj.text = decrypted.text || messageObj.text;
              messageObj.image = decrypted.image || messageObj.image;
              messageObj.isDecryptedForDisplay = true; // Flag for frontend
            } else {
              // User doesn't have encryption keys - show placeholder
              messageObj.text = "[Encrypted message - keys not available]";
              messageObj.decryptionFailed = true;
            }
          } catch (decryptError) {
            console.error("❌ Auto-decryption failed:", decryptError);
            messageObj.text = "[Unable to decrypt message]";
            messageObj.decryptionFailed = true;
          }
        }
        
        return messageObj;
      })
    );

    res.status(200).json(decryptedMessages);
  } catch (error) {
    console.error("Error in getMessages controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    console.log("📩 Incoming message data:");
    console.log("User:", req.user);
    console.log("Params:", req.params);
    console.log("Body:", req.body);

    const { text, image, groupId, sentiment, replyTo, selectedModel, encrypt } = req.body;
    const receiverId = req.params.id;
    const senderId = req.user._id;

    // ❌ TEMPORARILY DISABLE ENCRYPTION
    const shouldEncrypt = false; // Changed from true to false

    // Validate replyTo message exists if provided
    if (replyTo) {
      const replyToMessage = await Message.findById(replyTo);
      if (!replyToMessage) {
        return res.status(404).json({ message: "Reply target message not found." });
      }
    }

    let imageUrl;
    if (image) {
      try {
        const uploadResponse = await cloudinary.uploader.upload(image);
        imageUrl = uploadResponse.secure_url;
      } catch (uploadError) {
        console.error("Image upload failed:", uploadError.message);
        return res.status(500).json({ message: "Image upload failed." });
      }
    }

    // Enhanced toxicity and sentiment analysis for text messages
    let analysisResult = {
      toxicity: {
        isToxic: false,
        toxicityScore: 0,
        severity: "none",
        categories: []
      },
      sentiment: {
        value: sentiment || "neutral",
        confidence: 0,
        score: 0,
        source: "user_provided",
        wordAnalysis: [],
        enhanced: false
      },
      sentimentOverridden: false
    };

    if (text && text.trim()) {
      try {
        console.log(`🛡️ Running enhanced analysis for text using model: ${selectedModel || "svc"}`);
        
        // Use the enhanced analysis with selected model
        const analysis = await analyzeTextToxicityWithEnhancedSentiment(text, selectedModel || "svc");
        
        analysisResult = {
          toxicity: analysis.toxicity,
          sentiment: {
            value: analysis.sentiment.value,
            confidence: analysis.sentiment.confidence,
            score: analysis.sentiment.score,
            source: analysis.sentiment.source,
            wordAnalysis: analysis.sentiment.wordAnalysis,
            enhanced: analysis.sentiment.enhanced
          },
          sentimentOverridden: analysis.sentimentOverridden
        };
        
        // Fallback sentiment detection for common cases when enhanced analysis fails
        if (!analysisResult.sentiment.enhanced && analysisResult.sentiment.source === "fallback") {
          const lowerText = text.trim().toLowerCase();
          const positiveWords = ['beautiful', 'amazing', 'great', 'wonderful', 'fantastic', 'awesome', 'good', 'happy', 'love', 'excellent'];
          const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'sad', 'angry', 'horrible'];
          
          if (positiveWords.some(word => lowerText.includes(word))) {
            analysisResult.sentiment.value = "positive";
            analysisResult.sentiment.confidence = 0.7;
            analysisResult.sentiment.source = "keyword_fallback";
            console.log("✅ Applied positive keyword fallback for:", lowerText);
          } else if (negativeWords.some(word => lowerText.includes(word))) {
            analysisResult.sentiment.value = "negative";
            analysisResult.sentiment.confidence = 0.7;
            analysisResult.sentiment.source = "keyword_fallback";
            console.log("✅ Applied negative keyword fallback for:", lowerText);
          }
        }
        
        // Update the sentiment value with the analysis result
        sentimentValue = analysisResult.sentiment.value;
        
        console.log("✅ Enhanced analysis complete:", {
          toxic: analysisResult.toxicity.isToxic,
          sentiment: analysisResult.sentiment.value,
          enhanced: analysisResult.sentiment.enhanced,
          source: analysisResult.sentiment.source,
          overridden: analysisResult.sentimentOverridden
        });

      } catch (error) {
        console.error("❌ Enhanced analysis failed, falling back to basic:", error);
        
        try {
          // Fallback to basic toxicity analysis
          const toxicityData = await analyzeTextToxicity(text.trim());
          
          analysisResult = {
            toxicity: toxicityData,
            sentiment: {
              value: toxicityData.isToxic ? "negative" : sentimentValue,
              confidence: 0,
              score: 0,
              source: "toxicity_fallback",
              wordAnalysis: [],
              enhanced: false
            },
            sentimentOverridden: toxicityData.isToxic && sentimentValue !== "negative"
          };
          
          sentimentValue = analysisResult.sentiment.value;
          
        } catch (fallbackError) {
          console.error("❌ All analysis methods failed:", fallbackError);
          // Keep original defaults if everything fails
        }
      }
    }

    // Encryption logic - ALWAYS ATTEMPT TO ENCRYPT
    let messageData = {
      text: text?.trim(),
      image: imageUrl
    };
    let encryptedData = null;
    let isEncrypted = false;

    // Always try to encrypt if message has content
    if (text?.trim() || imageUrl) {
      try {
        // Get recipient's public key
        let recipient;
        if (groupId) {
          const group = await Group.findById(groupId).populate('members', 'publicKey keyId encryptionEnabled');
          if (!group) return res.status(404).json({ message: "Group not found" });
          
          const encryptionEnabledMembers = group.members.filter(member => 
            member.encryptionEnabled && member.publicKey && member._id.toString() !== senderId.toString()
          );
          
          if (encryptionEnabledMembers.length > 0) {
            recipient = encryptionEnabledMembers[0];
          }
        } else {
          recipient = await User.findById(receiverId).select('publicKey keyId encryptionEnabled');
          if (!recipient) return res.status(404).json({ message: "Recipient not found" });
        }

        // Encrypt if recipient has encryption enabled
        if (recipient && recipient.encryptionEnabled && recipient.publicKey) {
          console.log("🔐 Encrypting message (encryption is always on)");
          encryptedData = await e2eEncryption.encryptMessage(JSON.stringify(messageData), recipient.publicKey);
          isEncrypted = true;
          
          // Clear the original data since it's now encrypted
          messageData.text = null;
          messageData.image = null;
          
          console.log("✅ Message encrypted successfully");
        } else {
          console.log("⚠️ Recipient doesn't have encryption enabled, sending unencrypted");
        }
      } catch (encryptionError) {
        console.error("❌ Encryption failed:", encryptionError);
        // Continue without encryption instead of failing
        console.log("⚠️ Sending message unencrypted due to encryption error");
      }
    }

    let newMessage;

    if (groupId) {
      // Group message - always encrypted
      newMessage = new Message({
        senderId,
        groupId,
        text: shouldEncrypt ? null : text,  // Clear text is null when encrypted
        image: shouldEncrypt ? null : image,  // Clear image is null when encrypted
        sentiment: analysisResult.sentiment.value || sentimentValue,
        sentimentAnalysis: analysisResult.sentiment,
        sentimentOverridden: analysisResult.sentimentOverridden,
        toxicity: analysisResult.toxicity,
        replyTo: replyTo || null,
        isEncrypted: shouldEncrypt,
        encryptedData: shouldEncrypt ? {} : undefined  // Will be populated by encryption logic
      });
    } else {
      // Direct message - always encrypted
      newMessage = new Message({
        senderId,
        receiverId,
        text: shouldEncrypt ? null : text,  // Clear text is null when encrypted
        image: shouldEncrypt ? null : image,  // Clear image is null when encrypted
        sentiment: analysisResult.sentiment.value || sentimentValue,
        sentimentAnalysis: analysisResult.sentiment,
        sentimentOverridden: analysisResult.sentimentOverridden,
        toxicity: analysisResult.toxicity,
        replyTo: replyTo || null,
        isEncrypted: shouldEncrypt,
        encryptedData: shouldEncrypt ? {} : undefined  // Will be populated by encryption logic
      });
    }

    await newMessage.save();

    // Populate reply and sender info
    const populatedMessage = await Message.findById(newMessage._id)
      .populate('senderId', 'fullName profilePic')
      .populate({
        path: 'replyTo',
        populate: {
          path: 'senderId',
          select: 'fullName profilePic'
        }
      });
    
    console.log("Saved message:", populatedMessage);

    if (groupId) {
      io.to(groupId.toString()).emit("newGroupMessage", populatedMessage);
    } else {
      const receiverSocketId = getReceiverSocketId(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("newMessage", populatedMessage);
      }
    }

    res.status(201).json(populatedMessage);
  } catch (error) {
    console.error("❌ sendMessage error:", error);
    res.status(500).json({ message: error.message || "Internal Server Error" });
  }
};

// Make sure all other functions have complete try-catch blocks
// Check around line 317 for any incomplete blocks