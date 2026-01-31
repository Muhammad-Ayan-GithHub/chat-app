import { supabase } from "./supabase.js";

window.signup = async () => {
  const email = email.value;
  const password = password.value;
  const username = document.getElementById("username").value;

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (!error) {
    await supabase.from("users").insert({
      id: data.user.id,
      email,
      username
    });
    location.href = "login.html";
  }
};

window.login = async () => {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value
  });
  if (!error) location.href = "inbox.html";
};
