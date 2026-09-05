// Supabase Auth "Send SMS Hook" → SOLAPI 단일 문자 발송.
//
// Supabase Auth가 전화 OTP(회원가입 signInWithOtp 등)를 보낼 때, 기본 제공자(Twilio 등) 대신
// 이 함수를 호출한다. 요청은 Standard Webhooks 규격으로 서명되어 오므로 먼저 서명을 검증하고,
// payload의 sms.otp를 SOLAPI로 실제 발송한다. 성공 시 빈 200 응답이 곧 "발송 완료" 신호다.
//
// 필요한 함수 비밀값(supabase secrets set):
//   SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER_NUMBER  ← deploy.env의 그 값들
//   SEND_SMS_HOOK_SECRET  ← GoTrue 훅 시크릿과 동일한 `v1,whsec_<base64>` 원문(대시보드 표시값).
//                           GoTrue는 base64 부분을 base64decode 한 것을 HMAC 키로 쓴다.
//
// ⚠️ SOLAPI API 키의 "허용 IP 제한"은 반드시 꺼둘 것 — 이 함수의 나가는 IP는 고정되지 않는다.
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const SOLAPI_API_KEY = Deno.env.get("SOLAPI_API_KEY") ?? "";
const SOLAPI_API_SECRET = Deno.env.get("SOLAPI_API_SECRET") ?? "";
const SOLAPI_SENDER = Deno.env.get("SOLAPI_SENDER_NUMBER") ?? "";
const HOOK_SECRET = Deno.env.get("SEND_SMS_HOOK_SECRET") ?? "";

function randomSalt(bytes = 32): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

// HMAC-SHA256(key=apiSecret, msg=date+salt) → hex. SOLAPI 인증 서명 규격.
async function hmacHex(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(msg));
  return Array.from(new Uint8Array(sig), (x) => x.toString(16).padStart(2, "0")).join("");
}

// Supabase는 전화번호를 E.164(+8210...)로 준다. SOLAPI 국내 발송은 010... 형식.
function normalizePhone(phone: string): string {
  let p = (phone ?? "").replace(/[^\d+]/g, "");
  if (p.startsWith("+82")) p = "0" + p.slice(3);
  else if (p.startsWith("82")) p = "0" + p.slice(2);
  return p;
}

async function sendSolapi(to: string, text: string): Promise<{ ok: boolean; status: number; body: string }> {
  const date = new Date().toISOString();
  const salt = randomSalt();
  const signature = await hmacHex(SOLAPI_API_SECRET, date + salt);
  const auth =
    `HMAC-SHA256 apiKey=${SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`;
  const res = await fetch("https://api.solapi.com/messages/v4/send", {
    method: "POST",
    headers: { "Authorization": auth, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { to, from: SOLAPI_SENDER, text } }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

Deno.serve(async (req) => {
  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);

  // 1) 서명 검증 — Supabase가 보낸 요청이 맞는지(위조 방지). 시크릿은 v1,whsec_ 접두어를 떼고 쓴다.
  let user: { phone?: string }, sms: { otp?: string };
  try {
    const wh = new Webhook(HOOK_SECRET.replace("v1,whsec_", ""));
    ({ user, sms } = wh.verify(payload, headers) as { user: { phone?: string }; sms: { otp?: string } });
  } catch (e) {
    console.error("훅 서명 검증 실패", String(e));
    return new Response(JSON.stringify({ error: "invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const to = normalizePhone(user?.phone ?? "");
  const otp = sms?.otp ?? "";
  if (!to || !otp) {
    return new Response(JSON.stringify({ error: "missing phone or otp" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2) SOLAPI로 실제 문자 발송. 짧게 유지해 SMS(90바이트) 안에 들어가게 한다.
  const text = `가온병원 인증번호 ${otp} (5분 내 입력)`;
  try {
    const r = await sendSolapi(to, text);
    if (!r.ok) {
      console.error("SOLAPI 발송 실패", r.status, r.body);
      return new Response(JSON.stringify({ error: `solapi ${r.status}` }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.log("SOLAPI 발송 결과", r.body);
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("SOLAPI 호출 예외", String(e));
    return new Response(JSON.stringify({ error: "send failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
