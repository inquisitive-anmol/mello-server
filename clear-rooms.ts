import mongoose from "mongoose";
import { config } from "dotenv";
import { Room } from "./src/modules/rooms/room.model";
config();
mongoose.connect(process.env.MONGODB_URI as string).then(async () => {
  const result = await Room.updateMany({ status: "active" }, { status: "ended", endedAt: new Date() });
  console.log("Cleared rooms:", result);
  process.exit(0);
});
