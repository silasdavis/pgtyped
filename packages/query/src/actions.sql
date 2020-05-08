/*
  @name GetCatalogTypes
  @param oids -> (...)
*/
SELECT pt.oid, pt.typname, pt.typtype, pe.enumlabel
FROM pg_type pt
LEFT JOIN pg_enum pe ON pt.oid = pe.enumtypid
WHERE pt.oid IN :oids;
