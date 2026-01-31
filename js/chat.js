import { supabase } from "./supabase.js";

const user = (await supabase.auth.getUser()).data.user;

window.send = async () => {
  await supabase.from("messages").insert({
    message: msg.value,
    sender_id: user.id
  });
  msg.value = "";
};

supabase.channel("chat")
.on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" },
payload => {
  messages.innerHTML += `<p>${payload.new.message}</p>`;
}).subscribe();
