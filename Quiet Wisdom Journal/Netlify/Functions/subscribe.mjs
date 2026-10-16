// Receives { name, email, type } from the Quiet · Wisdom signup form and adds
// the person as a contact in Brevo. The Brevo API key never reaches the
// browser — it's read here, server-side, from environment variables you set
// in the Netlify dashboard (Site configuration > Environment variables):
//
//   BREVO_API_KEY      - your Brevo API key (Brevo: Settings > SMTP & API > API Keys)
//   BREVO_LIST_ID      - the numeric ID of the Brevo list for "Just for me" signups
//                        (Brevo: Contacts > Lists > click the list > the ID is in the URL)
//   BREVO_TEAM_LIST_ID - the numeric ID of the Brevo list for "For my team at work"
//                        signups. If this isn't set, team signups fall back to
//                        BREVO_LIST_ID so nothing is ever lost.
//
// `type` is "individual" or "team" and picks which list the contact lands in.
//
// This function is reachable at /api/subscribe (see the `config` export below).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const type = body.type === "team" ? "team" : "individual";

  if (!name || !EMAIL_RE.test(email)) {
    return new Response(JSON.stringify({ error: "A valid name and email are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.BREVO_API_KEY;
  const individualListId = process.env.BREVO_LIST_ID;
  // Team signups go to BREVO_TEAM_LIST_ID when it's set; otherwise they fall
  // back to the individual list rather than failing outright.
  const listId = type === "team" && process.env.BREVO_TEAM_LIST_ID
    ? process.env.BREVO_TEAM_LIST_ID
    : individualListId;

  if (!apiKey || !listId) {
    console.error("subscribe: missing BREVO_API_KEY or BREVO_LIST_ID environment variable");
    return new Response(JSON.stringify({ error: "Server is not configured yet" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const brevoRes = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        email,
        attributes: { FIRSTNAME: name },
        listIds: [Number(listId)],
        updateEnabled: true, // re-signups update the existing contact instead of erroring
      }),
    });

    // Brevo returns 201 for a new contact and 204 when updateEnabled updates an existing one.
    if (brevoRes.status === 201 || brevoRes.status === 204) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const errText = await brevoRes.text();
    console.error("subscribe: Brevo API error", brevoRes.status, errText);
    return new Response(JSON.stringify({ error: "Could not save your details right now" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("subscribe: network error calling Brevo", err);
    return new Response(JSON.stringify({ error: "Could not reach the signup service" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = {
  path: "/api/subscribe",
};
