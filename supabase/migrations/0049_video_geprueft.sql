-- 0049: Monats-Check -- wurde ein Video nachkontrolliert?
-- Beim Recap geht man alle Videos eines Monats durch und hakt ab, ob Link
-- und Video stimmen. geprueft_am haelt fest, wann das war.
alter table videos add column if not exists geprueft_am timestamptz;
