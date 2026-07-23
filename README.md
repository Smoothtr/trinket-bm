# Trinket Business Manager

Ứng dụng quản lý nội bộ Trinket. Giao diện nghiệp vụ tiếp tục chạy trên Vercel; Firebase đảm nhiệm đăng nhập, phân quyền, dữ liệu bền vững và ảnh.

## Kiến trúc production (phương án B)

- Vercel phục vụ HTML/CSS/JavaScript và Node API tại domain hiện tại.
- Firebase Authentication đăng nhập bằng email/mật khẩu.
- Firebase Custom Claims lưu một trong bốn vai trò: `admin`, `sale`, `ops`, `accounting`.
- Vercel API xác minh Firebase ID token và thực thi phân quyền ở server; role từ trình duyệt không còn được tin cậy.
- Cloud Firestore thay JSON tạm của Vercel làm nguồn dữ liệu production.
- Firebase Storage lưu ảnh tại `deal-items/{orderId}/{itemId}/{fileName}`.
- Firestore không cho trình duyệt đọc/ghi trực tiếp. Dữ liệu nghiệp vụ chỉ đi qua API.
- Vercel truy cập Google Cloud bằng OIDC/Workload Identity Federation, không lưu service-account private key.
- App Check chưa được bật theo quyết định hiện tại.

## Tài nguyên Firebase đã tạo

- Project: `trinket-54786` (`526965479424`).
- Web app: `Trinket BM Web`.
- Firestore `(default)`: Standard, region `asia-southeast1`, bật delete protection.
- Storage bucket: `trinket-54786.firebasestorage.app`, region `ASIA-SOUTHEAST1`.
- Authentication: Email/Password đã bật.
- Authorized domains: `localhost`, `trinket-bm.gg99.vn` và hai domain mặc định của Firebase.
- Service account không khóa: `trinket-vercel@trinket-54786.iam.gserviceaccount.com`, có `roles/datastore.user`, `roles/firebaseauth.viewer` và custom role tối thiểu `projects/trinket-54786/roles/trinketFirebaseUserManager` để tạo/khóa user, cập nhật Custom Claims và rollback user khi ghi hồ sơ thất bại.
- Firestore rules/indexes và Storage rules đã deploy.
- Dữ liệu `data/seed.json` đã migration thành công sang Firestore.
- Tài khoản `smooth@gg99.vn` đã có custom claim `admin`; dùng “Quên mật khẩu” để đặt mật khẩu lần đầu.

Policy của Google Cloud đang chặn tạo service-account key. Không nới policy này; OIDC là phương án production được chọn.

## Chạy local

Chế độ mặc định giữ cách phát triển cũ: JSON tại `data/store.json`, không hiện màn hình đăng nhập và tự dùng quyền admin local.

```bash
npm install
npm start
```

Mở `http://localhost:4173`. Reset dữ liệu mẫu bằng `npm run reset-data`.

## Deploy cấu hình Firebase

Repo đã gắn project qua `.firebaserc`. Sau khi đăng nhập Firebase CLI bằng tài khoản có quyền:

```bash
npx firebase-tools deploy --only auth,firestore:rules,firestore:indexes,storage
```

`firestore.rules` cố ý từ chối toàn bộ client access vì Admin API trên Vercel là cổng dữ liệu duy nhất. `storage.rules` chỉ cho tài khoản đăng nhập đọc ảnh; `admin`, `sale`, `ops` được tải/xóa JPG, PNG hoặc WEBP tối đa 5 MB.

## OIDC giữa Vercel và Google Cloud

Sau khi đăng nhập đúng Vercel team/project đang sở hữu `trinket-bm.gg99.vn`:

1. Bật Vercel OIDC cho project.
2. Tạo Workload Identity Pool `vercel` và OIDC provider `vercel` trong Google Cloud.
3. Dùng issuer theo đúng Vercel team và giới hạn audience/team; không dùng một provider global không có điều kiện owner.
4. Chỉ cấp `roles/iam.workloadIdentityUser` trên service account `trinket-vercel` cho subject của đúng Vercel project và environment `production` (thêm `preview` riêng nếu cần).
5. Khai báo các biến môi trường bên dưới rồi deploy preview trước production.

Ứng dụng dùng `@vercel/oidc` và `google-auth-library` để đổi token ngắn hạn lấy quyền service account. Không cần và không nên tạo `FIREBASE_SERVICE_ACCOUNT_JSON`.

API Quản lý tài khoản cần các permission `firebaseauth.users.get`, `firebaseauth.users.create`, `firebaseauth.users.update` và `firebaseauth.users.delete` (delete chỉ dùng để rollback một lần tạo hồ sơ bị lỗi, giao diện không có chức năng xóa). Production đang dùng custom IAM role `trinketFirebaseUserManager` chỉ gồm bốn permission này; không cấp role `roles/firebaseauth.admin` rộng.

## Biến môi trường Vercel

```text
FIREBASE_AUTH_ENABLED=1
DATA_BACKEND=firestore
FIREBASE_WEB_API_KEY=<Firebase Web API key>
FIREBASE_AUTH_DOMAIN=trinket-54786.firebaseapp.com
FIREBASE_PROJECT_ID=trinket-54786
FIREBASE_STORAGE_BUCKET=trinket-54786.firebasestorage.app
FIREBASE_WEB_APP_ID=1:526965479424:web:6f2c47d8f47e423fbae0e5
AUTH_PASSWORD_RESET_CONTINUE_URL=https://trinket-bm.gg99.vn/
GCP_PROJECT_ID=trinket-54786
GCP_PROJECT_NUMBER=526965479424
GCP_SERVICE_ACCOUNT_EMAIL=trinket-vercel@trinket-54786.iam.gserviceaccount.com
GCP_WORKLOAD_IDENTITY_POOL_ID=vercel
GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID=vercel
VTP_WEBHOOK_SECRET=<random-secret>
```

`VERCEL_OIDC_TOKEN` do Vercel tự cấp khi OIDC được bật; không nhập thủ công. Production trả 503 nếu thiếu Firebase config, Google credentials hoặc `DATA_BACKEND=firestore`, nhờ đó không thể vô tình quay lại JSON tạm.

## Chuyển dữ liệu JSON sang Firestore

Kiểm tra trước:

```bash
npm run firebase:migrate -- --dry-run
```

Migration lần đầu:

```bash
npm run firebase:migrate -- --source=data/seed.json
```

Script không ghi đè Firestore đã có dữ liệu. Chỉ sau khi backup và chủ động chấp nhận ghi đè:

```bash
npm run firebase:migrate -- --source=C:\backup.json --force --confirm=OVERWRITE_FIRESTORE
```

## Tạo tài khoản và gán quyền

Trong ứng dụng, đăng nhập bằng Admin / Chủ, mở **Cấu hình → Quản lý tài khoản → Tạo tài khoản**. Admin chỉ nhập hồ sơ và chọn một trong bốn role hiện có; hệ thống không yêu cầu và không hiển thị mật khẩu. Firebase gửi email để nhân viên tự đặt mật khẩu lần đầu.

API dùng collection `users` làm hồ sơ nhân viên và Firebase Custom Claim `role` làm nguồn quyền thực thi. Mỗi request backend đọc Custom Claims hiện hành từ Firebase, do đó quyền cũ không tiếp tục được tin cậy. Khi đổi role hoặc khóa tài khoản, refresh token cũng bị thu hồi.

Script dưới đây chỉ dành cho bootstrap/khôi phục khi chưa truy cập được giao diện Admin:

```bash
npm run firebase:create-user -- --email=admin@example.com --role=admin --name="Admin Trinket"
npm run firebase:create-user -- --email=sale@example.com --role=sale --name="Nhân viên Sale"
```

Vai trò:

- `admin`: toàn quyền, cấu hình, xóa dữ liệu và raw export.
- `sale`: khách hàng, tạo/chỉnh deal, ghi nhận thanh toán mới.
- `ops`: sản phẩm, tồn kho, nguồn hàng, giao vận; trong deal chỉ đổi trạng thái và phí giao.
- `accounting`: chi phí và thanh toán; được xem dữ liệu tài chính.

Hệ thống không có mật khẩu mặc định dùng chung và không in mật khẩu tạm. Backend tạo một credential khởi tạo ngẫu nhiên chỉ để Firebase có thể phát email đặt mật khẩu; giá trị này không được trả về frontend, lưu vào hồ sơ hay ghi Audit log. Sau khi tạo/gán role, hệ thống gửi email đặt mật khẩu bằng template của Firebase. Nếu gửi email thất bại, kết quả trả về `passwordEmailSent: false` và có cảnh báo thật; có thể gửi lại từ giao diện Quản lý tài khoản.

## Giá vốn và ảnh sản phẩm trong deal

- Mỗi item dùng `unit_cost` làm giá vốn đơn vị; Engine tính `unit_cost × quantity` rồi cộng nguồn hàng, vật liệu lịch sử và phí giao.
- Ảnh item được lưu dưới dạng metadata `image.storage_path`, `original_name`, `content_type`, `size`, `uploaded_at`; database không lưu base64 hoặc blob URL.
- Ảnh mới chỉ được upload khi người dùng bấm Lưu. Nếu API thất bại, ảnh mới được rollback; ảnh cũ chỉ bị xóa sau khi deal cập nhật thành công.
- Deal cũ thiếu `unit_cost` hoặc `image` tiếp tục được normalize về `0` và `null`, không cần migration Firestore.
- Các ô tiền trong luồng deal hiển thị dấu chấm hàng nghìn bằng utility `public/money.js`, nhưng API và Firestore vẫn nhận số nguyên.

## Kiểm thử

```bash
npm run check
npm run test:unit
npm run test:smoke
```

Đã kiểm tra:

- Smoke test giao diện hiện tại và luồng sản phẩm/deal ở local-admin/JSON mode.
- Firebase Email/Password sign-in thật.
- API từ chối request không token; `sale` đọc bootstrap nhưng bị chặn raw export và chi phí.
- Storage rules cho phép `sale` upload/xóa ảnh hợp lệ.
- Firestore migration và custom claim `admin` được đọc lại thành công.

## Trình tự deploy an toàn

1. Hoàn tất OIDC trên đúng Vercel project.
2. Khai báo env cho Preview và Production.
3. Deploy preview, đăng nhập `smooth@gg99.vn`, kiểm tra bốn role.
4. Chỉ sau khi preview đạt mới push/promote production.

Domain production vẫn là [trinket-bm.gg99.vn](https://trinket-bm.gg99.vn/); `firebase.json` không có Firebase Hosting.

## Rollback

- Rollback code bằng deployment trước trên Vercel.
- Không đặt `DATA_BACKEND=json` trên production vì JSON serverless không bền vững.
- Giữ backup JSON ngoại tuyến trước mỗi migration ghi đè.
- Nếu nghi ngờ OIDC bị cấp sai scope, gỡ binding `roles/iam.workloadIdentityUser` của principal Vercel; không cần xoay private key vì không có key dài hạn.
