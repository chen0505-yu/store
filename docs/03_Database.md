# Database Specification

建議資料表：
- users
- teachers
- products
- product_tags
- orders
- order_items
- payments
- stock_logs
- shipments
- votes
- vote_items

## teachers
- id
- teacher_code：4~6碼短UUID
- name
- avatar_url
- social_url
- sort_order
- is_active

## products
- id
- teacher_id
- name
- type：preorder / instock
- price
- image_url
- arrival_status：not_arrived / arrived，只用於預購
- stock_quantity：只用於現貨
- is_sold_out
- tags

## orders
- id
- order_number：LT000001
- user_id
- order_type：preorder / instock
- status
- total_amount

## payments
只用於預購。

## stock_logs
只用於現貨。
