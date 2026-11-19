# LINE OA SHOP

หน้าร้านภาษาไทยและหลังบ้านสำหรับเพิ่มบริการ เพิ่มแพ็กเกจ แก้ราคา และซ่อนรายการ

## Build

ใช้ Node.js 22 ขึ้นไป จากโฟลเดอร์นี้รัน `npm ci` และ `npm run build` ไฟล์ Worker ที่สร้างอยู่ที่ `dist/server/index.js`

เว็บไซต์ใช้งานบน ChatGPT Sites และรับตัวตนผ่านระบบลงชื่อเข้าใช้ของ Sites ตั้ง `SHOP_ADMIN_EMAIL` เป็นค่าลับของโปรเจกต์ โดยใช้บัญชี ChatGPT ของเจ้าของร้าน ประกาศ D1 binding ชื่อ `DB` ใน `.openai/hosting.json` ของโปรเจกต์ Sites และใช้ migration จาก `drizzle/` ตัวอย่างรูปแบบ manifest อยู่ใน `.openai/hosting.example.json`

ไฟล์ `worker/catalog.seed.json` เป็นแคตตาล็อกเริ่มต้น เมื่อบันทึกจาก `/admin` ครั้งแรก รายการจะจัดเก็บใน D1 การกดบันทึกครั้งถัดไปจะแสดงผลบนหน้าร้านทันที

โฟลเดอร์นี้เก็บซอร์สสำหรับเผยแพร่ผ่าน Sites ส่วนโปรเจกต์ Next.js ที่รากของ repository ยังใช้ขั้นตอน build ของ Vercel ตามเดิม
