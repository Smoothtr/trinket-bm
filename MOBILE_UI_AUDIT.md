# Đánh giá giao diện mobile — Trinket Business Manager

Kiểm tra ngày 4/8/2026, viewport 375×840 (iPhone 12/13/14), chạy local `http://localhost:4173`.
Đã quét 8 view: Dashboard, Deal (Bảng + Kanban), Sản phẩm, Khách hàng, Nguồn hàng, Tài chính, Vận chuyển, Cấu hình + modal Tạo deal.

## Kết luận nhanh

Nền tảng responsive **đã có và đúng hướng** — không view nào bị tràn ngang trang (`document.scrollWidth = 375`), bottom nav hoạt động, modal full-screen `100dvh`, có `env(safe-area-inset-*)`, viewport meta chuẩn. Nhưng **chưa dùng được thoải mái trên điện thoại**: 5/6 bảng dữ liệu vẫn là bảng desktop phải cuộn ngang, một lỗi layout hiển thị sai ở bảng Deal, và thanh topbar chiếm 32–40% chiều cao màn hình.

Mức độ: **6.5/10** — dùng được để xem, chưa dùng được để làm việc.

---

## P1 — Lỗi hiển thị, cần sửa ngay

### 1. Bảng Deal: dòng phụ nhảy sang cột nhãn

Trên card mobile, ô "Khách" hiển thị:

```
KHÁCH            Trần Thảo Linh
0918001122
```

Số điện thoại rơi xuống cột nhãn thay vì nằm dưới tên. Tương tự ở "Sản phẩm", "Due date".

**Nguyên nhân.** `styles.css:4756` (và bản trùng ở `:2966`) đặt `td { display: grid; grid-template-columns: 94px minmax(0,1fr) }`. Markup trong `app.js:1590+` là `Trần Thảo Linh<br><span class="small muted">0918001122</span>`. Với CSS Grid, `<br>` không tạo ngắt dòng — mỗi phần tử con trở thành một grid item riêng: `::before` → cột 1, text node → cột 2, `<span>` → **cột 1 của hàng kế tiếp**.

**Cách sửa (CSS-only, an toàn nhất).** Bỏ grid ở cấp `td`, dùng nhãn absolute:

```css
@media (max-width: 767px) {
  .orders-table td,
  .orders-table td:first-child {
    position: relative;
    display: block;
    padding: 9px 11px 9px 105px;
    min-height: 40px;
  }
  .orders-table td::before {
    position: absolute;
    top: 11px;
    left: 11px;
    width: 88px;
  }
}
```

**Cách sửa triệt để hơn.** Đổi markup: bọc phần nội dung vào một thẻ duy nhất, giữ nguyên grid.

```html
<td data-label="Khách">
  <div class="cell-stack">
    <span>Trần Thảo Linh</span>
    <span class="small muted">0918001122</span>
  </div>
</td>
```

### 2. Ô "Mã đơn" bị bó 98px trên mobile

`styles.css:605` — `.orders-table td:nth-child(2) { width: 98px }` (specificity 0,2,1) thắng rule mobile `.orders-table td` (0,1,1), nên trên điện thoại ô này vẫn 98px trong khi nội dung rộng 232px (`grid-template-columns` tính ra `94px 0px`). Hiện đang "may mắn" trông ổn vì tràn ra ngoài, nhưng mã đơn dài hơn sẽ đè lên nhãn.

**Sửa.** Bọc các rule cột cố định vào `@media (min-width: 768px)`:

```css
@media (min-width: 768px) {
  .orders-table th:nth-child(2),
  .orders-table td:nth-child(2) { width: 98px; }
  .orders-table th:nth-child(4),
  .orders-table td:nth-child(4) { min-width: 120px; }
  .orders-table th:nth-child(5),
  .orders-table td:nth-child(5) { min-width: 150px; }
}
```

---

## P2 — Vấn đề trải nghiệm chính

### 3. 5/6 bảng chưa có layout card — phải cuộn ngang

Chỉ `.orders-table` được chuyển thành card. Các bảng còn lại giữ nguyên dạng desktop trong `.table-wrap { overflow-x: auto }`:

| View | Bảng | Số cột | Rộng bảng | Rộng khung | Tỉ lệ |
|---|---|---|---|---|---|
| Sản phẩm | `.product-table` | 8 | 946px | 345px | **2,7×** |
| Khách hàng | `.table-wrap` | 9 | 873px | 345px | **2,5×** |
| Tài chính | 2 bảng | 6 và 5 | 860px | 345px | **2,5×** |
| Nguồn hàng | `.table-wrap` | 8 | 860px | 345px | **2,5×** |
| Vận chuyển | `.table-wrap` | 8 | 894px | 345px | **2,6×** |

Thực tế trên màn Sản phẩm chỉ thấy được ~2,5/8 cột. Giá bán, tồn kho và nút Sửa/Xóa đều nằm ngoài màn hình — người dùng phải cuộn ngang trong một khung cuộn dọc, thao tác rất dễ trượt.

**Sửa.** Tổng quát hóa pattern card đã có sẵn thay vì viết lại:

1. Thêm `data-label="..."` vào mọi `<td>` của 5 bảng trên (trong `app.js`).
2. Thêm class chung `stack-table` cho các `<table>` đó.
3. Tách khối CSS card hiện tại ra thành rule dùng chung `.stack-table` thay vì `.orders-table`, giữ `.orders-table` như một alias.
4. Ở mobile, ẩn bớt cột ít dùng (`.hide-sm`) để card không quá dài — ví dụ bảng Sản phẩm chỉ cần: ảnh + tên, giá bán, tồn, thao tác.

### 4. Topbar chiếm 204px, cộng bottom nav 65px = 269px

Trên iPhone 12 (844px) mất **32%** màn hình cho chrome; trên iPhone SE (667px) mất **40%**. Ở view Deal, cộng thêm toolbar (~160px) thì người dùng phải cuộn 360px mới thấy dòng dữ liệu đầu tiên.

Topbar mobile đang xếp 4 hàng: tiêu đề + hamburger / ô tìm kiếm / bộ lọc ngày + chọn nhanh / role filter + nút Tạo deal.

**Sửa.**

- Gộp hàng 1: tiêu đề bên trái, icon tìm kiếm + hamburger bên phải; ô tìm kiếm mở ra dạng overlay khi bấm.
- Chuyển bộ lọc ngày + role filter vào bottom sheet mở từ một nút "Bộ lọc" có badge số filter đang bật.
- Bỏ nút "Tạo deal" ở topbar — nó đang **hiển thị trùng** với nút "Tạo deal" trong toolbar ngay bên dưới. Hoặc giữ một FAB tròn góc phải dưới.
- Mục tiêu: topbar ≤ 64px ở trạng thái mặc định.

### 5. Bộ lọc ngày và nút "Tạo deal" xuất hiện ở mọi view

Màn Sản phẩm, Khách hàng, Cấu hình vẫn hiện "Tùy chỉnh ngày / Chọn nhanh / Tạo deal" dù không liên quan. Trên desktop chỉ là thừa; trên mobile là chiếm mất 1/4 màn hình.

**Sửa.** Topbar theo ngữ cảnh: mỗi view khai báo action riêng, chỉ Dashboard/Deal/Tài chính mới render bộ lọc kỳ.

### 6. Input font-size 14px → iOS tự phóng to khi focus

Toàn bộ 37 input/select và 3 textarea trong modal đều `font-size: 14px`. Safari iOS tự động zoom trang khi focus vào field có cỡ chữ < 16px, sau đó không tự thu lại — người dùng bị lệch layout giữa chừng khi nhập deal.

**Sửa.**

```css
@media (max-width: 767px) {
  input, select, textarea { font-size: 16px; }
}
```

(Không dùng `maximum-scale=1` để chặn zoom — sẽ chặn cả pinch-zoom, hỏng accessibility.)

### 7. Form Tạo deal dài 5.269px — hơn 8,5 màn hình, không có điều hướng

7 section (01 Thông tin khách hàng → 07 Cọc và ghi chú) cuộn liền mạch trong `.modal-body` cao 614px. Muốn sửa mục "Cọc" phải cuộn qua toàn bộ phần sản phẩm và báo giá.

**Sửa.**

- Trên mobile, mặc định thu gọn (accordion) section 02–07, chỉ mở 01; hoặc chuyển thành stepper 3 bước: *Khách hàng → Sản phẩm & báo giá → Nguồn hàng & thanh toán*.
- Thêm thanh nhảy section sticky ngay dưới modal header.
- Rút gọn mô tả trong modal header (hiện chiếm 3 dòng).
- Footer sticky với "Tổng thanh toán" + Hủy/Lưu đang làm **tốt**, giữ nguyên.

---

## P3 — Chi tiết nên chỉnh

### 8. Vùng chạm nhỏ hơn chuẩn

24–43 phần tử tương tác mỗi màn có chiều cao < 40px. Chuẩn tối thiểu là 44px (Apple HIG) / 48px (Material).

| Phần tử | Kích thước hiện tại |
|---|---|
| Nút icon Sửa/Xóa `.ghost` | 36 × 36 |
| Select "Chọn nhanh" (kỳ) | cao 30 |
| Nút menu overflow `summary` | 36 × 36 |
| Nút trong menu overflow | cao 38 |
| Nút toolbar `.button`, `.primary` | cao 32–36 |
| Nút "Bảng / Kanban" | cao 32 |

```css
@media (max-width: 767px) {
  .button, .primary, .ghost, select, .mobile-overflow summary { min-height: 44px; }
  .ghost.icon-only, .row-actions .ghost { width: 44px; height: 44px; }
}
```

### 9. Cỡ chữ nhỏ

`.eyebrow` 10px, nhãn bottom nav 10,5px, `.tag` / `td::before` 11px, `.money` trong bảng sản phẩm 10,5px. Dưới ánh sáng ngoài trời và với người trên 40 tuổi là khó đọc. Nên đặt sàn 12px trên mobile, nhãn bottom nav 11px.

### 10. Biểu đồ Dashboard `min-width: 720px` trong khung 313px

Chỉ thấy được ~43% biểu đồ, phải cuộn ngang bên trong panel. Đề xuất: ở mobile giảm `min-width` xuống ~520px **và** giảm số điểm dữ liệu (chỉ 6 kỳ gần nhất) để bỏ hẳn cuộn ngang; hoặc thay bằng sparkline + bảng số.

### 11. KPI grid 1 cột

4 thẻ KPI × ~97px = 390px cuộn trước khi tới nội dung chính, mỗi thẻ chỉ chứa 3 dòng chữ. Chuyển sang 2 cột ở ≤767px và rút gọn chiều cao thẻ:

```css
@media (max-width: 767px) {
  .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
```

Hiện `.kpi-grid` đang bị ép về `1fr` tại `styles.css:4713`.

### 12. Kanban khó thao tác trên mobile

Board rộng 2.228px trong khung 347px (8 cột), drag handle nhỏ. Kéo thả bằng ngón tay trong một vùng vừa cuộn ngang vừa cuộn dọc gần như không dùng được.

**Sửa.** Trên mobile: (a) đổi trạng thái bằng `<select>` ngay trong card thay vì kéo thả, hoặc (b) hiển thị 1 cột tại một thời điểm với tab trạng thái ở trên, vuốt để chuyển cột.

---

## Nợ kỹ thuật CSS

`public/styles.css` (4.937 dòng) có các khối media query **trùng lặp và chồng nhau**:

| Breakpoint | Xuất hiện tại dòng |
|---|---|
| `max-width: 1180px` | 2553 **và** 4410 |
| `max-width: 560px` | 2734 (chứa layout card bảng Deal, dòng 2942–3000) |
| `max-width: 767px` | 4510 (**lặp lại** layout card bảng Deal, dòng 4747–4800) |
| `max-width: 860px` | 2582 |
| `max-width: 760px` | 3024 |
| `min-width: 768px` | 3610 |

Layout card cho bảng Deal được định nghĩa **hai lần** với thông số khác nhau (`92px` vs `94px` cột nhãn, `font-size` nhãn 11px vs 10px). Sửa một chỗ sẽ không có tác dụng ở chỗ kia — đây là lý do lỗi ở mục 1 và 2 khó phát hiện.

**Đề xuất.** Gộp về một hệ breakpoint duy nhất và xóa các khối cũ:

- `≤ 767px` — mobile (bottom nav, card table, 1 cột)
- `768–1023px` — tablet (sidebar icon 72px, 2 cột form)
- `≥ 1024px` — desktop (sidebar đầy đủ)

---

## Những điểm đang làm tốt (giữ nguyên)

- Không view nào tràn ngang trang — `document.scrollWidth` luôn bằng viewport.
- Bottom nav 5 mục + menu overflow "≡" cho 3 mục còn lại (Nguồn hàng, Vận chuyển, Cấu hình) — đúng pattern mobile.
- Modal full-screen dùng `100dvh` (không dính lỗi `100vh` trên iOS Safari).
- Có `env(safe-area-inset-bottom)` cho bottom nav và toast host.
- Meta viewport chuẩn `width=device-width, initial-scale=1`, không khóa zoom.
- Footer modal sticky với tổng tiền + hành động full-width.
- Toolbar và panel header đã tự chuyển sang xếp dọc.

---

## Thứ tự đề xuất triển khai

| # | Việc | Ước lượng | Ảnh hưởng |
|---|---|---|---|
| 1 | Sửa lệch cột bảng Deal (mục 1) + reset `nth-child` width (mục 2) | ~1h | Cao — lỗi hiển thị |
| 2 | `font-size: 16px` cho input trên mobile (mục 6) | ~15p | Cao — hỏng luồng nhập deal |
| 3 | Gộp media query, xóa khối trùng (nợ kỹ thuật) | ~2h | Cao — chặn mọi việc sau |
| 4 | Card layout cho 5 bảng còn lại (mục 3) | ~4–6h | Cao |
| 5 | Rút gọn topbar + topbar theo ngữ cảnh (mục 4, 5) | ~3h | Cao |
| 6 | Vùng chạm 44px + sàn cỡ chữ 12px (mục 8, 9) | ~1h | Trung bình |
| 7 | Accordion/stepper cho form Tạo deal (mục 7) | ~4h | Trung bình |
| 8 | Biểu đồ, KPI 2 cột, Kanban mobile (mục 10, 11, 12) | ~3h | Thấp–TB |
