'use strict';
// Tạo chứng chỉ HTTPS tự ký cho mạng LAN: node make-cert.js
// Cần có lệnh openssl (macOS/Linux có sẵn; Windows dùng Git Bash hoặc WSL).
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = path.join(__dirname, 'certs');
fs.mkdirSync(dir, { recursive: true });
const ips = [];
for (const list of Object.values(os.networkInterfaces()))
  for (const i of list || []) if (i.family === 'IPv4' && !i.internal) ips.push(i.address);
const san = ['DNS:localhost', 'IP:127.0.0.1', ...ips.map((ip) => 'IP:' + ip)].join(',');
try {
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '825',
    '-keyout', path.join(dir, 'key.pem'), '-out', path.join(dir, 'cert.pem'),
    '-subj', '/CN=phone-party', '-addext', 'subjectAltName=' + san], { stdio: 'inherit' });
  console.log('\nĐã tạo certs/key.pem và certs/cert.pem cho:', san);
  console.log('Chạy lại "npm start" để server chuyển sang HTTPS (https://...:3000).');
  console.log('Lần đầu mở trên điện thoại và PC, bấm "Nâng cao > Tiếp tục truy cập" vì chứng chỉ tự ký.');
} catch (e) {
  console.error('Không chạy được openssl. Hãy cài openssl rồi thử lại.');
  process.exit(1);
}
