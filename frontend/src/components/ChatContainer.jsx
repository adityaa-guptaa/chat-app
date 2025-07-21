import { useChatStore } from "../store/useChatStore";
import { useEffect, useRef, useState } from "react";

import ChatHeader from "./ChatHeader";
import MessageInput from "./MessageInput";
import MessageSkeleton from "./skeletons/MessageSkeleton";
import { useAuthStore } from "../store/useAuthStore";
import { formatMessageTime } from "../lib/utils";

const ChatContainer = () => {
  const {
    messages,
    getMessages,
    isMessagesLoading,
    selectedUser,
    subscribeToMessages,
    unsubscribeFromMessages,
  } = useChatStore();
  const { authUser } = useAuthStore();
  const messageEndRef = useRef(null);
  // Store pinned message id and associated user id
  const [pinnedMessageData, setPinnedMessageData] = useState(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const messageRefs = useRef({});

  useEffect(() => {
    getMessages(selectedUser._id);

    subscribeToMessages();

    return () => unsubscribeFromMessages();
  }, [selectedUser._id, getMessages, subscribeToMessages, unsubscribeFromMessages]);

  useEffect(() => {
    if (messageEndRef.current && messages) {
      messageEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  if (isMessagesLoading) {
    return (
      <div className="flex-1 flex flex-col overflow-auto">
        <ChatHeader />
        <MessageSkeleton />
        <MessageInput />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      <ChatHeader />

      {pinnedMessageData?.id && pinnedMessageData?.userId === selectedUser._id && (
        <div
          className="bg-base-200 p-2 border-b cursor-pointer text-sm flex justify-between items-center"
        >
          <span onClick={() => {
            const el = messageRefs.current[pinnedMessageData.id];
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              setHighlightedMessageId(pinnedMessageData.id);
              setTimeout(() => setHighlightedMessageId(null), 1500);
            }
          }}>
            📌 Pinned Message — Click to view
          </span>
          <button
            className="ml-4 text-xs text-error"
            onClick={() => setPinnedMessageData(null)}
          >
            Unpin
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message._id}
            className={`chat relative ${message.senderId === authUser._id ? "chat-end" : "chat-start"} ${highlightedMessageId === message._id ? "bg-base-300" : ""}`}
            ref={(el) => {
              if (el) messageRefs.current[message._id] = el;
              if (message._id === messages[messages.length - 1]._id) messageEndRef.current = el;
            }}
          >
            <div className=" chat-image avatar">
              <div className="size-10 rounded-full border">
                <img
                  src={
                    message.senderId === authUser._id
                      ? authUser.profilePic || "/avatar.png"
                      : selectedUser.profilePic || "/avatar.png"
                  }
                  alt="profile pic"
                />
              </div>
            </div>
            <div className="chat-header mb-1">
              <time className="text-xs opacity-50 ml-1">
                {formatMessageTime(message.createdAt)}
              </time>
            </div>
            <div className="chat-bubble">
              {message.image && (
                <img
                  src={message.image}
                  alt="Attachment"
                  className="sm:max-w-[200px] rounded-md mb-2"
                />
              )}
              {message.text && <p className="whitespace-pre-wrap break-words text-justify">{message.text}</p>}
            </div>
            {message.senderId === authUser._id && (
              <div className="relative flex justify-end mt-1 z-20">
                <div className="group relative">
                  <button
                    className="text-lg px-2 hover:bg-base-200 rounded-full transition peer"
                    title="More options"
                  >
                    ⋯
                  </button>
                  <div className="absolute right-0 bottom-0 translate-y-full mb-2 min-w-[120px] scale-95 origin-top-right hidden peer-hover:flex group-hover:flex flex-col bg-base-100 border border-base-300 rounded-lg shadow-lg text-xs animate-fade-in z-50">
                    <button
                      className="px-4 py-2 text-left hover:bg-base-200 hover:font-bold text-primary"
                      onClick={() => {
                        setPinnedMessageData((prev) =>
                          prev?.id === message._id && prev?.userId === selectedUser._id
                            ? null
                            : { id: message._id, userId: selectedUser._id }
                        );
                      }}
                    >
                      {pinnedMessageData?.id === message._id && pinnedMessageData?.userId === selectedUser._id ? "Unpin" : "Pin"}
                    </button>
                    <button className="px-4 py-2 text-left hover:bg-base-200 hover:font-bold text-secondary">Edit</button>
                    <button className="px-4 py-2 text-left hover:bg-base-200 hover:font-bold text-error">Delete</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <MessageInput />
    </div>
  );
};
export default ChatContainer;
