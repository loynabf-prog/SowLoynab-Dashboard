-- 0066 — Ein Claude-Chat pro Video (Fassie, 28.10.2026)
-- videos.chat_url: der Chat, in dem Vorschauen und Aenderungen zu diesem Video
-- besprochen werden. Der Chat traegt sich beim ersten Oeffnen selbst ein.
-- Die Push "Raus aus dem Ofen" verlinkt direkt auf diesen Chat.
-- (eingespielt per apply_migration; ofen_raus_push() wie in 0064, nur mit Link auf chat_url)
alter table videos add column if not exists chat_url text;
comment on column videos.chat_url is 'Claude-Chat, in dem Vorschauen und Änderungen zu diesem Video besprochen werden (ein Chat pro Video)';
