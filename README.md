# Trinket Business Manager

MVP web app nội bộ cho brief "Hệ thống quản lý kinh doanh Trinket".

## Chạy local

```bash
cd trinket-business-manager
npm start
```

Mở `http://localhost:4173`.

## Demo public

Production demo: https://trinket-bm.gg99.vn

Trên Vercel, dữ liệu demo được copy từ `data/seed.json` sang vùng tạm của serverless function. Các thao tác tạo/sửa có thể tồn tại trong một phiên warm instance nhưng không được xem là dữ liệu bền vững.

## Module đã có

- Dashboard KPI, biểu đồ doanh thu/lợi nhuận/loại sản phẩm/chi phí.
- Widget việc cần làm: đơn quá hạn, đơn chưa cọc, công nợ, vận đơn lâu chưa cập nhật.
- Quản lý deal theo bảng và Kanban pipeline.
- Kéo-thả thẻ Kanban để đổi trạng thái deal.
- CRM khách hàng, phân khúc mới/quay lại/VIP.
- Hồ sơ khách hàng chi tiết với lịch sử đơn, công nợ và ghi chú/size.
- Nguồn hàng, vendor, chi phí đầu vào theo từng đơn.
- Tài chính: P&L, chi phí vận hành, thanh toán, công nợ aging và copy nội dung nhắc thu.
- Hóa đơn song ngữ VN/EN dạng trang in/lưu PDF từ trình duyệt.
- Viettel Post adapter mock: tính cước, tạo vận đơn, đồng bộ tracking, webhook endpoint.
- Audit log lưu thao tác tạo/sửa quan trọng.
- Export danh sách đơn CSV.
- Form tạo deal dùng định dạng ngày `dd/mm/yyyy`, dropdown địa giới mẫu, đặt cọc ban đầu và thông số trang sức.

## Dữ liệu

Server dùng JSON store tại `data/store.json`. Lần chạy đầu sẽ copy từ `data/seed.json`.

Reset dữ liệu mẫu:

```bash
npm run reset-data
```

## API chính

- `GET /api/bootstrap`
- `POST /api/products`
- `PATCH /api/products/:id`
- `DELETE /api/products/:id`
- `POST /api/inventory/adjustments`
- `POST /api/orders`
- `PATCH /api/orders/:id`
- `POST /api/payments`
- `POST /api/expenses`
- `POST /api/shipments/quote`
- `POST /api/shipments/create`
- `POST /api/shipments/:id/tracking-sync`
- `POST /api/viettelpost/webhook`
- `GET /api/receipts/:orderId?lang=vi|en`
- `GET /api/export/orders.csv`

## Luồng sản phẩm

- Module `Sản phẩm` là danh mục duy nhất cho mẫu có sẵn, chất liệu và lịch sử biến động tồn.
- Deal `Mẫu có sẵn` lấy snapshot tên, giá bán, giá vốn và thông số tại thời điểm chọn; sửa catalog sau này không đổi lịch sử deal.
- Deal `Mẫu tùy chỉnh` nhập trực tiếp theo yêu cầu khách và không tạo thêm bản ghi catalog.
- Tồn kho được giữ từ trạng thái đã cọc/đang xử lý, trừ khi hoàn tất và hoàn lại khi hủy.
- Dữ liệu giá kim loại cũ trong deal vẫn được giữ để bảo toàn lịch sử; deal mới dùng giá vốn mẫu hoặc chi phí nguồn hàng thực tế.

## Ghi chú triển khai tiếp

MVP hiện dùng JSON để chạy nhanh và demo nghiệp vụ. Khi production nên chuyển sang PostgreSQL/MySQL, thêm đăng nhập thật, phân quyền server-side, queue/cron cho Viettel Post, upload file, và PDF rendering server-side.

Các P0 từ recommendation chưa thể đóng hoàn toàn nếu thiếu dữ liệu/tài khoản thật:

- Đăng nhập/RBAC production: cần quyết định cơ chế tài khoản, mời user, policy mật khẩu và phân quyền backend đầy đủ.
- Viettel Post thật: cần token/tài khoản, kho gửi, bảng dịch vụ và callback/webhook đã đăng ký.
- Hóa đơn/PDF production: cần logo, thông tin shop/MST nếu có, mẫu hóa đơn chính thức và nơi lưu file.
- Database/backup: bản Vercel demo đang dùng store tạm, không phải dữ liệu bền vững.
