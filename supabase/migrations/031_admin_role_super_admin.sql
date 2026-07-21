-- 平台調整：admin_role 的 'admin' 改名為 'super_admin'，語意上跟繪師（artist）角色對稱。
-- 沿用同一張 admin_users/admin_sessions 表，不是新建表；既有帳號的 role 值自動跟著改名，
-- 不需要另外遷移資料。
alter type admin_role rename value 'admin' to 'super_admin';

-- 繪師帳號需要知道自己對應哪一間 teachers（商店身分），super_admin 帳號不設定這欄。
alter table admin_users add column if not exists teacher_id uuid references teachers(id) on delete set null;

alter table admin_users alter column role set default 'super_admin';

create index if not exists admin_users_teacher_id_idx on admin_users(teacher_id);
