export const metadata = {
  title: "병원 시스템 ERD — 쉬운 데이터 지도",
  description: "비개발자를 위한 확대·축소 가능한 병원 시스템 ERD"
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
