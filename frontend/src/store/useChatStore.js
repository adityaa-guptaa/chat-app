import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";

export const useChatStore = create((set, get) => ({
  messages: [],
  users: [],
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,

  getUsers: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/messages/users");
      set({ users: res.data });
    } catch (error) {
      toast.error(error.response.data.message);
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getMessages: async (userId, groupId) => {
    set({ isMessagesLoading: true });
    try {
      const url = groupId
        ? `/messages/${userId}?groupId=${groupId}`
        : `/messages/${userId}`;
      const res = await axiosInstance.get(url);
      set({ messages: res.data });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to fetch messages");
    } finally {
      set({ isMessagesLoading: false });
    }
  },
  sendMessage: async (messageData) => {
    const { selectedUser, messages } = get();
    try {
      let res;
      if (selectedUser.isGroup) {
        // Group chat - no receiverId in URL
        res = await axiosInstance.post("/messages/send", messageData);
      } else {
        // Direct chat - receiverId in URL
        res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, messageData);
      }
      set({ messages: [...messages, res.data] });
      return res.data; // Return the saved message
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to send message");
      throw error; // Re-throw to handle in component
    }
  },

  subscribeToMessages: () => {
    const { selectedUser } = get();
    if (!selectedUser) return;

    const socket = useAuthStore.getState().socket;
    const authUser = useAuthStore.getState().authUser;
    if (!socket?.connected || !authUser) {
      console.warn("Socket not connected or user not authenticated in subscribeToMessages");
      return;
    }

    console.log("Subscribing to messages for:", selectedUser, "Current user:", authUser._id);

    socket.on("newMessage", (newMessage) => {
      console.log("Received newMessage event:", newMessage);
      console.log("Current conversation - selectedUser:", selectedUser._id, "authUser:", authUser._id);
      console.log("Message details - senderId:", newMessage.senderId, "receiverId:", newMessage.receiverId);
      
      // Convert ObjectIds to strings for comparison
      const messageSenderId = newMessage.senderId?._id?.toString() || newMessage.senderId?.toString();
      const messageReceiverId = newMessage.receiverId?.toString();
      const selectedUserId = selectedUser._id?.toString();
      const authUserId = authUser._id?.toString();
      
      // For direct chat: check if message is between current user and selected user
      // For group chat: check if message is for current group
      const isRelevantMessage = selectedUser.isGroup
        ? newMessage.groupId === selectedUser.groupId
        : (
          (messageSenderId === selectedUserId && messageReceiverId === authUserId) ||
          (messageSenderId === authUserId && messageReceiverId === selectedUserId)
        );

      console.log("Comparison details:", {
        messageSenderId,
        messageReceiverId,
        selectedUserId,
        authUserId,
        isRelevantMessage
      });

      if (isRelevantMessage) {
        console.log("✅ Adding message to store:", newMessage);
        
        // Check if message already exists to prevent duplicates
        const currentMessages = get().messages;
        const messageExists = currentMessages.some(msg => msg._id === newMessage._id);
        
        if (!messageExists) {
          set({
            messages: [...currentMessages, newMessage],
          });
          console.log("✅ Message added successfully");
        } else {
          console.log("⚠️ Message already exists, skipping duplicate");
        }
      } else {
        console.log("❌ Message not relevant for current conversation", {
          selectedUser: selectedUserId,
          authUser: authUserId,
          messageSender: messageSenderId,
          messageReceiver: messageReceiverId,
          messageGroupId: newMessage.groupId,
          isGroup: selectedUser.isGroup
        });
      }
    });

    socket.on("newGroupMessage", (newMessage) => {
      console.log("Received newGroupMessage event:", newMessage);
      
      if (selectedUser.isGroup && newMessage.groupId === selectedUser.groupId) {
        // Check if message already exists to prevent duplicates
        const currentMessages = get().messages;
        const messageExists = currentMessages.some(msg => msg._id === newMessage._id);
        
        if (!messageExists) {
          console.log("Adding group message to store:", newMessage);
          set({
            messages: [...currentMessages, newMessage],
          });
        } else {
          console.log("Group message already exists, skipping:", newMessage._id);
        }
      }
    });
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (socket) {
      socket.off("newMessage");
      socket.off("newGroupMessage");
      console.log("Unsubscribed from messages");
    }
  },

  setSelectedUser: (selectedUser) => set({ selectedUser }),

  // Update group profile
  updateGroupProfile: async (groupId, data) => {
    try {
      const res = await axiosInstance.put(`/group/update-profile/${groupId}`, data);
      // Update the selectedUser if it's the same group
      const { selectedUser } = get();
      if (selectedUser && selectedUser.groupId === groupId) {
        set({ selectedUser: { ...selectedUser, profilePic: res.data.profilePic } });
      }
      toast.success("Group profile updated successfully");
      return res.data;
    } catch (error) {
      console.error("Error updating group profile:", error);
      toast.error(error.response?.data?.message || "Failed to update group profile");
      throw error;
    }
  },
}));