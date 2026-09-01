import { WebchatWidget } from './widget/WebchatWidget';
import { createWebchatApi } from './api/webchatApi';
import { env } from './lib/env';

const api = createWebchatApi(env.supabaseUrl ? `${env.supabaseUrl}/functions/v1` : '');

export default function App() {
  // 콜백 슬롯(onAuthGate·onHandoffNeeded·renderCard)은 Task 15가
  // 실제 화면(WEBMOD-AUTH·WEBANON-HANDOFF·WEBCARD)으로 채운다.
  // hospitalPhone은 배포 시 get_public_hospital_info로 주입.
  return (
    <div id="webchat-app" role="region" aria-label="AI 상담봇">
      <WebchatWidget
        api={api}
        hospitalPhone=""
        onAuthGate={() => {}}
        onHandoffNeeded={() => {}}
        renderCard={() => null}
      />
    </div>
  );
}
