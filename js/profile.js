import { supabase } from "./supabase.js";

const user = (await supabase.auth.getUser()).data.user;

window.save = async () => {
  await supabase.from("users").update({
    username: username.value,
    bio: bio.value
  }).eq("id", user.id);
  alert("Profile Updated");
};
