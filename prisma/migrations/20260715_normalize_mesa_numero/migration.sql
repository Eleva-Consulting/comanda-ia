-- Normalizar números de mesa que começam com "Mesa " (case-insensitive)
UPDATE "mesas"
SET numero = TRIM(REGEXP_REPLACE(numero, '^[Mm][Ee][Ss][Aa]\s+', ''))
WHERE numero ~* '^\s*[Mm][Ee][Ss][Aa]\s+';
