// No caller-supplied redirect may cross the TEST/PROD boundary.
export function getResetUrl(supabaseUrl: string): string {
  const origin = new URL(supabaseUrl).origin;
  if (origin === "https://qownzparzsaeoyccgwuj.supabase.co") return "https://partneros.manwinwin.com/reset-password";
  if (origin === "https://avxxzmoayxzrykwqzoqn.supabase.co") return "https://partneros-manwinwin.lovable.app/reset-password";
  throw new Error("Unknown Supabase environment; refusing to send an access link");
}

export async function findAuthUser(admin: any, email: string, userId?: string) {
  if (userId) {
    const { data, error } = await admin.getUserById(userId);
    if (error) throw error;
    if (data.user?.email?.toLowerCase() !== email) throw new Error("User ID and email do not match");
    return data.user;
  }
  // Legacy callers and duplicate checks must scan beyond Auth's first page.
  for (let page = 1; ; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const users = data?.users ?? [];
    const match = users.find((user: any) => user.email?.toLowerCase() === email);
    if (match) return match;
    if (users.length < 100) return null;
  }
}

export async function sendAccessLink(auth: any, user: any, redirectTo: string): Promise<"invite" | "recovery"> {
  if (!user.email_confirmed_at) {
    const { error } = await auth.admin.inviteUserByEmail(user.email, { redirectTo });
    if (!error) return "invite";
    // Confirmation may have raced the resend. Only this specific error may
    // fall back to recovery; rate limits and delivery failures must surface.
    if (error.code !== "email_exists" && error.code !== "user_already_exists") throw error;
  }
  const { error } = await auth.resetPasswordForEmail(user.email, { redirectTo });
  if (error) throw error;
  return "recovery";
}
