-- Compteurs AGRÉGÉS de la mesure d'utilisation anonyme (voir edge/event.ts).
-- Une ligne = un jour × une combinaison de dimensions ; jamais une ligne par visiteur.
-- Les dimensions absentes valent '' (et non NULL) pour que la clé primaire fonctionne.
CREATE TABLE IF NOT EXISTS daily_events (
  day TEXT NOT NULL,            -- AAAA-MM-JJ (UTC)
  type TEXT NOT NULL,           -- page_view, cutout_done, cutout_failed, engine_fallback, download, tool_used, batch_zip
  page TEXT NOT NULL DEFAULT '',
  lang TEXT NOT NULL DEFAULT '',
  engine TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  tool TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT '',
  time_bucket TEXT NOT NULL DEFAULT '',
  size_bucket TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, type, page, lang, engine, model, tool, format, time_bucket, size_bucket)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS daily_events_type_day ON daily_events (type, day);
