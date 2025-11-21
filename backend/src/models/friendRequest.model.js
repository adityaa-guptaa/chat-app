

import mongoose from "mongoose";

const friendRequestSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

friendRequestSchema.statics.unfriend = async function (userId1, userId2) {
  const User = mongoose.model("User");

  // Remove each user from the other's friends array
  await User.findByIdAndUpdate(userId1, {
    $pull: { friends: userId2 }
  });
  await User.findByIdAndUpdate(userId2, {
    $pull: { friends: userId1 }
  });

  // Optionally remove any existing friend request documents between the users
  await this.deleteMany({
    $or: [
      { sender: userId1, receiver: userId2 },
      { sender: userId2, receiver: userId1 }
    ]
  });
};
const FriendRequest = mongoose.model("FriendRequest", friendRequestSchema);

export default FriendRequest;

