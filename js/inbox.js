import { supabase } from "./supabase.js";

const user = (await supabase.auth.getUser()).data.user;

const { data } = await supabase
  .from("chat_requests")
  .select("*")
  .eq("receiver_id", user.id)
  .eq("status", "pending");

document.getElementById("requests").innerHTML = data.map(r =>
  `<div>
    Request from ${r.sender_id}
    <button onclick="accept('${r.id}','${r.sender_id}')">Accept</button>
  </div>`
).join("");

window.accept = async (id, sender) => {
  await supabase.from("chat_requests").update({ status: "accepted" }).eq("id", id);
  await supabase.from("chats").insert({ user1_id: sender, user2_id: user.id });
  location.href = "chat.html";
};
