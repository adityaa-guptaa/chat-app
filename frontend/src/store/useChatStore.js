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
    if (!socket) {
      console.log("⚠️ Socket not available for subscription");
      return;
    }

    console.log("👂 Subscribing to messages for:", selectedUser);

    // ✅ Listen for new messages
    socket.on("newMessage", (newMessage) => {
      console.log("📨 New message received via socket:", newMessage);
      
      const { selectedUser: currentSelectedUser } = get();
      const currentUserId = useAuthStore.getState().authUser?._id;
      
      // ✅ Check if message belongs to current conversation
      const isRelevant = 
        (currentSelectedUser?.groupId && newMessage.groupId === currentSelectedUser.groupId) ||
        (!currentSelectedUser?.groupId && 
         ((newMessage.senderId._id === currentSelectedUser?._id && newMessage.receiverId._id === currentUserId) ||
          (newMessage.senderId._id === currentUserId && newMessage.receiverId._id === currentSelectedUser?._id)));

      if (isRelevant) {
        console.log("✅ Message is relevant, adding to state");
        
        // ✅ Check for duplicates before adding
        set((state) => {
          const messageExists = state.messages.some(msg => msg._id === newMessage._id);
          if (messageExists) {
            console.log("⚠️ Duplicate message detected, skipping");
            return state;
          }
          
          return {
            messages: [...state.messages, newMessage]
          };
        });
      } else {
        console.log("⚠️ Message not relevant to current conversation");
      }
    });

    console.log("✅ Socket message listener registered");
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (socket) {
      console.log("🔇 Unsubscribing from messages");
      socket.off("newMessage");
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