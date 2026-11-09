# 🎮 Phone Party Arcade v7

Hub game 3D chạy trên PC (Three.js), mỗi điện thoại là một tay cầm (joystick, nút A/B, cảm biến nghiêng).
Server Node.js **không cần `npm install`**, chỉ cần Node 18 trở lên.

```
[Điện thoại 1..8] ──WebSocket──► [server.js] ◄──WebSocket── [PC: index.html + Three.js]
```

## Chạy nhanh

```bash
npm start        # Windows: nháy đúp file chay-game.bat
```

1. Trên PC mở `http://localhost:3000` (hiện **mã phòng** + **mã QR**).
2. Điện thoại quét QR, nhập tên, bấm "Vào chơi" (lần sau quét QR là tự vào).
3. Gạt joystick để chọn game (trái/phải/lên/xuống), bấm **A** để bắt đầu.

Bố cục sảnh: bên trái là mã QR và danh sách người chơi, **bên phải là bảng chọn game**, còn **khoảng trống ở giữa là nơi các nhân vật 3D của người chơi xuất hiện** khi họ quét mã (đông người thì tự xếp thành nhiều hàng).

Chơi thử một mình: bấm "Thêm người chơi bằng bàn phím" (WASD/mũi tên, Space hoặc J = A, K = B).
Phím tắt PC: `M` nhạc · `F` toàn màn hình · `Q` đổi chất lượng đồ họa · `Esc` về menu.

## 🌐 Ai cũng chơi được, KHÔNG cần cùng Wi-Fi (mặc định)

Từ bản v7, `npm start` **tự mở một link HTTPS công khai** ngay khi khởi động. Việc cần làm: không có gì cả.

- Sau khoảng 10-30 giây, mã QR trên màn hình PC tự đổi sang link công khai (có thông báo "🌐 Sẵn sàng").
  Từ lúc đó **bất kỳ ai** quét QR đều vào được: dùng 4G, Wi-Fi nhà khác, ở thành phố khác đều được.
- Bấm vào dòng địa chỉ dưới QR để **sao chép link mời** gửi qua Zalo/Messenger cho người không ở cạnh bạn.
  (Link dạng `https://xxxx.trycloudflare.com/play?c=ABCD`, nhập tên rồi chơi.)
- Có HTTPS hợp lệ nên **cảm biến nghiêng (đua xe) cũng chạy** trên mọi điện thoại.
- Trong lúc chờ link công khai, QR tạm là địa chỉ cùng Wi-Fi để bạn bè trong nhà vào ngay.
- Lần đầu server **tự tải `cloudflared`** (công cụ miễn phí của Cloudflare, ~35MB, không cần tài khoản) vào thư mục `bin/`,
  những lần sau dùng luôn. Nếu không tải được, server thử tiếp bằng `ssh` (localhost.run → serveo → pinggy);
  Windows 10/11, macOS, Linux đều có sẵn `ssh`.
- Đường hầm bị đứt (mạng chập chờn) thì **tự dựng lại**. Lưu ý link công khai có thể đổi, khi đó QR trên PC đổi theo
  và người đang chơi cần quét lại.
- Game vẫn chạy trên PC của bạn: **PC phải bật và nối Internet** suốt buổi chơi.

Muốn chơi trong nhà, không mở ra Internet: `npm run lan` (hoặc đặt `LAN_ONLY=1`). Dùng dịch vụ tunnel khác (ngrok...):
đặt `PUBLIC_URL=https://địa-chỉ-của-bạn` rồi `npm start`. Đã có `cloudflared` riêng: đặt `CLOUDFLARED_BIN=đường-dẫn`.

**Link cố định, không cần bật PC:** deploy lên Internet. Repo có sẵn `render.yaml` (Render) và `Procfile` (Railway/Heroku).
Render: đẩy code lên GitHub > *New > Blueprint*, mở `https://tên.onrender.com` trên PC, QR trỏ đúng địa chỉ online
(gói miễn phí ngủ khi không dùng, lần mở đầu mất ~30 giây). Khi chạy trên các dịch vụ này server tự biết và không mở đường hầm.

### 🔒 Bảo mật khi mở ra Internet

- Địa chỉ công khai ngẫu nhiên, khó đoán; vào phòng cần **mã phòng 4 chữ**. Đoán sai quá 12 lần/phút từ một IP là bị khóa 2 phút.
- Người lạ biết mã phòng cũng **không chiếm được quyền chủ phòng** (PC giữ một khóa bí mật, tải lại trang vẫn giữ được phòng).
- Giới hạn tối đa 40 phòng, 400 kết nối; chỉ máy chạy server mới bật/tắt được đường hầm.
- Chỉ chia sẻ link/mã cho người bạn muốn mời. Ngưng chia sẻ = tắt server (Ctrl+C).

## 🔧 Điện thoại không vào được?

Mở `http://IP-của-PC:3000/check` trên điện thoại: trang này kiểm tra từng bước và chỉ ra chỗ hỏng. Nguyên nhân hay gặp:

| Dấu hiệu | Cách xử lý |
|---|---|
| "Máy chủ không trả lời" | Cùng Wi-Fi chưa? Windows: chạy `open-firewall.bat` bằng quyền Administrator. |
| Wi-Fi công cộng/khách/công ty | Mạng chặn thiết bị gọi nhau → dùng QR công khai (tab **🌐 Mọi mạng / 4G**, mặc định). |
| QR trỏ sai địa chỉ (card mạng ảo VirtualBox/WSL/Docker) | Bấm vào dòng địa chỉ dưới QR để đổi sang IP khác. |
| iPhone lỗi khi dùng `https://IP:3000` | Chứng chỉ tự ký bị iPhone chặn WebSocket. Dùng `npm start` (HTTP) hoặc QR công khai (🌐 Mọi mạng). |
| PC tải lại trang | Mã phòng được giữ nguyên, điện thoại tự nối lại, không phải vào lại. |
| Tab 🌐 báo "chưa mở được link công khai" | PC chưa có Internet, hoặc mạng chặn cả cloudflared lẫn ssh (Wi-Fi công ty/trường). Thử mạng khác / bật hotspot 4G cho PC, hoặc deploy lên Render. |

## 🎨 Đồ họa

Vật liệu PBR (sơn bóng clearcoat, kim loại, kính), phản chiếu môi trường, tone mapping ACES, bloom cho đèn/dung nham,
bóng đổ mềm, texture vẽ bằng code (nhựa đường, cỏ, thép tấm, bê tông), bầu trời gradient, xe/xe tăng/đĩa húc/nhân vật dựng chi tiết.
Máy yếu: game tự hạ chất lượng, hoặc bấm `Q`. Không cần file ảnh/model nào.

`npm run vendor` tải sẵn Three.js về `public/vendor/` (1 lần). Sau đó game chạy được cả khi PC không có Internet.
Server cũng tự thử tải khi khởi động; nếu không có mạng, game dùng CDN (jsDelivr/unpkg) như trước.

## 🤖 Chơi một mình? Có bot!

Khi chỉ có **1 người** trong phòng, game tự ghép thêm bot cho đủ đội hình (đua xe 4 người, bóng đá 2v2, Chạy Màu 6 người...).
Trong sảnh có công tắc **Bot**: *Tự động* (chỉ bù khi chơi 1 mình) · *Luôn bù* (lúc nào cũng bù cho đủ số người tối ưu của game) · *Tắt*,
và độ khó **Dễ / Vừa / Khó** (bot dễ phản ứng chậm, hay sai; bot khó gần như không mắc lỗi). Lựa chọn được nhớ trong trình duyệt.
Bot là người chơi thật sự của game (cùng luật, cùng điểm, cùng bảng xếp hạng) nên không gian lận.

## 👕 Trang phục nhân vật

Trên điện thoại, ở màn hình chọn game có nút **👕 Trang phục** (hoặc 🎲 để chọn ngẫu nhiên). Chọn mũ, đồ trên mặt, đồ trên thân,
màu và chất liệu (bóng / mờ / kim loại / neon); nhân vật trên màn hình PC đổi theo ngay. Lựa chọn được nhớ cho lần sau.
Có 24 mũ x 16 kiểu mặt x 15 phụ kiện thân x 4 chất liệu x 12 màu (hơn 23.000 tổ hợp). Danh sách trang phục cuộn được cả khi xoay ngang điện thoại. Mọi game dùng nhân vật hạt đậu đều hiện trang phục;
bot cũng được mặc đồ ngẫu nhiên. Muốn thêm đồ mới: sửa `public/js/looks.js` (danh sách), `models.js` (mô hình 3D) và `avatar.js` (hình xem trước).
Màu mỗi người trong phòng phải khác nhau (server tự từ chối màu trùng).

## ⚡ Chuyển game mượt

Danh sách game được dựng một lần, chọn game chỉ đổi lớp "đang chọn" nên không còn nháy/tải lại.
Khi bấm CHƠI, một màn che mờ hiện lên trong lúc game dựng cảnh và biên dịch trước các shader, nên không bị đứng hình ở giây đầu.

## Các game (35)

Lọc theo thể loại ở sảnh (🏁 Đua · ⚔️ Đối kháng · 🎉 Party · 🤝 Đồng đội), hoặc bấm **B** trên điện thoại để đổi thể loại.

| Game | Thể loại | Cách chơi |
|---|---|---|
| 💥 Bumper Arena | Đối kháng | Húc đối thủ rơi khỏi sàn đang thu hẹp. 5 round. |
| 🏎️ Đua xe Gyro | Đua | Nghiêng máy để lái, A nitro, B phanh. 4 vòng. |
| 🛡️ Bắn Tăng | Đối kháng | Joystick lái, A bắn, B khiên. 90 giây. |
| 💣 Bom Nóng | Đối kháng | Chuyền bom bằng cách chạm người khác; cầm khi nổ là loại. |
| ⚽ Bóng Đá | Đồng đội | 2 đội đỏ/xanh, rê bóng và A để sút, 90 giây. |
| 👑 Vua Đồi | Đối kháng | Đứng một mình trong vòng sáng di động để ghi điểm; A hất người khác văng. |
| 🪙 Thu Xu | Party | Nhặt xu/ngọc, tránh bom đen, A lao nhanh. 45 giây. |
| 🧊 Sàn Sụp | Party | Ô sàn rung rồi sụp; A nhảy qua khe. Người cuối cùng thắng. |
| 🎨 Tô Màu | Party | Chạy để tô ô sàn, A bom sơn. Phủ nhiều nhất thắng. |
| ☄️ Mưa Thiên Thạch | Party | Né vòng đỏ và tia quét, A lao bất tử chốc lát. |
| 🏐 Né Bóng | Party | Bóng bắn từ mọi phía, càng lúc càng nhanh. Chạm là bị loại. |
| 🐍 Rắn Săn Mồi | Đối kháng | Ăn ngọc để dài ra, đụng thân rắn khác là chết. Giữ A tăng tốc. |
| 🌈 Chạy Màu | Party | Chạy tới ô đúng màu được báo trước khi ô còn lại biến mất. |
| 🧟 Chống Zombie | Đồng đội | Cả đội cùng chống bầy zombie. Giữ A bắn (tự ngắm), B ném bom. |
| 🚧 Vượt Chướng Ngại | Đua | Chạy qua thanh quay, khối trượt, cột chắn tới vạch đích. |
| 🚦 Đèn Xanh Đèn Đỏ | Đua | Đèn xanh chạy, đèn đỏ phải đứng im, bị bắt sẽ về vạch xuất phát. |
| 🏃 Chạy Nước Rút *(mới)* | Đua | Thi chạy 100 mét: bấm A/B thật nhanh, bấm luân phiên hai nút sẽ nhanh hơn. |
| 🪑 Ghế Âm Nhạc *(mới)* | Party | Nhạc chạy thì đi vòng, nhạc dừng thì lao vào ghế. Luôn thiếu một ghế, A để lao húc. |
| 🪢 Nhảy Dây *(mới)* | Party | Thanh laser quét ngày càng nhanh, đổi chiều, thêm thanh thứ hai. A để nhảy qua. |
| ⚡ Nhanh Như Chớp *(mới)* | Party | Đèn đỏ chờ, đèn XANH bấm A nhanh nhất. Bấm sớm bị khóa nút. 7 lượt. |
| 🪢 Kéo Co | Đồng đội | Hai đội kéo cờ về vạch của mình, bấm A/B liên tục. Thắng 2 hiệp là vô địch. |
| 🔨 Đập Chuột Chũi *(mới)* | Party | Chạy tới hố có chuột và bấm A. Chuột vàng +3, chuột bom làm bạn choáng. |
| 🎈 Bơm Bóng Bay *(mới)* | Party | A bơm bóng, B chốt điểm. Bóng càng to điểm càng cao nhưng có thể nổ bất ngờ. |
| 🎯 Phi Tiêu *(mới)* | Party | Mọi người ngắm chung một tấm bia, tay run nhẹ, A phóng. 4 phi tiêu mỗi người. |
| 🍎 Hứng Trái Cây *(mới)* | Party | Chạy trái/phải hứng trái cây rơi, tránh bom đen. |
| 🚗 Băng Qua Đường *(mới)* | Đua | Băng qua 8 làn xe tới vạch đích, bị tông thì quay lại. Qua nhiều lần nhất thắng. |
| 🏗️ Xếp Tháp *(mới)* | Party | Bấm A đúng lúc để xếp khối gạch trượt thành tháp cao, thả chuẩn giữ nguyên khối. |
| 🏀 Ném Rổ *(mới)* | Party | Giữ A nạp lực, thả khi vạch chạm vùng xanh. Vùng xanh đổi sau mỗi cú ném. |
| 👾 Phi Thuyền Đồng Đội *(mới)* | Đồng đội | Cả đội chung 5 mạng bắn đàn alien theo từng đợt, ai hạ nhiều nhất đứng đầu. |
| 🐟 Cá Lớn Nuốt Cá Bé *(mới)* | Đối kháng | Ăn hạt để lớn, nuốt người nhỏ hơn, A bơi nước rút. Cuối giờ ai nặng nhất thắng. |
| 🃏 Lật Thẻ Trí Nhớ *(mới)* | Party | Đứng lên thẻ và bấm A để lật, tìm cặp giống nhau và chiếm thẻ. |
| 🚩 Cướp Cờ *(mới)* | Đồng đội | Hai đội cướp cờ địch mang về căn cứ nhà, A lao húc để chặn. |
| ⛸️ Trượt Băng Thu Sao *(mới)* | Party | Sàn băng trơn: thu sao (sao vàng +3), lao vào người khác để làm họ rơi sao. |
| 👾 Mê Cung Ăn Chấm *(mới)* | Đối kháng | Ăn chấm trong mê cung, tránh ma đỏ, ăn chấm lớn ở góc để húc ma +5. |
| 💣 Đặt Bom *(mới)* | Đối kháng | A đặt bom nổ hình chữ thập, phá thùng, nhặt vật phẩm, người cuối cùng thắng. |

Điểm mỗi ván: 10/7/5/3/2/1..., cộng dồn thành **tổng điểm** hiện trong sảnh. Cuối ván: bấm **A** chơi lại, **B** về menu.

## Cấu trúc

```
server.js        HTTP + WebSocket + phòng + API đường hầm (không phụ thuộc thư viện)
tunnel.js        đường hầm HTTPS công khai: tự tải cloudflared, dự phòng localhost.run / serveo / pinggy, tự dựng lại
vendor.js        tải sẵn Three.js về public/vendor
make-cert.js     chứng chỉ HTTPS tự ký (tùy chọn, npm run https)
open-firewall.bat  mở cổng 3000 trên Windows (chỉ cần khi chơi cùng Wi-Fi)
chay-game.bat    nháy đúp để chạy server + mở trình duyệt (Windows)
bin/             cloudflared được tải về tự động
public/
  index.html, controller.html (/play), check.html (/check)
  js/   boot.js (nạp three) · host.js · gfx.js (đồ họa) · models.js · party.js (tiện ích game) · controller.js · ...
  games/  35 game (mỗi file một game) · js/bots.js: bộ công cụ cho bot
test/    npm test: kiểm thử server (WebSocket thật) và chạy thử mọi game
```

## Thêm game mới

Tạo `public/games/ten-game.js`, import trong `public/js/host.js` và thêm vào mảng `GAMES`:

```js
import { setupScene, spawnBeans, stepBean, showBean } from '/js/party.js';
export default {
  id: 'demo', name: 'Tên game', emoji: '🎯', color: '#ff0', tag: '1-8 người',
  desc: 'Mô tả ngắn',
  cfg: { a: 'BẮN', b: '', gyro: false, hint: 'Gợi ý hiện trên điện thoại' },
  cat: 'party',   // race | fight | party | team: thể loại ở sảnh
  bots: 4,        // số người tối ưu: chơi một mình sẽ ghép bot cho đủ số này
  init(ctx) {},   // ctx: scene, camera, players, hud, sfx, vibrate, shake, addLights, finish
  think(dt) {},   // (tùy chọn) AI bot: điền p.input cho người chơi có p.bot, dùng /js/bots.js
  update(dt) {},  // p.input = {x,y,a,b}, p.press.a = vừa bấm A
  dispose() {},
};
```

`party.js` có sẵn hạt đậu (`spawnBeans`), di chuyển (`stepBean`), va chạm (`pushApart`), vẽ (`showBean`).
Khi xong gọi `ctx.finish([{ id, text }, ...])` theo thứ tự hạng 1, 2, 3...
