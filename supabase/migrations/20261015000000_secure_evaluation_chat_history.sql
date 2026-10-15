-- Chat history is model input, so only user-authored turns and server-provenance
-- assistant turns may enter the prompt. Existing assistant turns have no
-- provenance column and therefore remain untrusted after this migration.
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS trusted BOOLEAN NOT NULL DEFAULT FALSE;

-- The application never persisted system messages. Older authenticated clients
-- could insert them through the broad owner-only policy, so preserve their text
-- as ordinary user context instead of retaining a privileged role.
UPDATE chat_messages
SET role = 'user'
WHERE role = 'system';

ALTER TABLE chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_role_check;

ALTER TABLE chat_messages
  ADD CONSTRAINT chat_messages_role_check
  CHECK (role IN ('user', 'assistant'));

ALTER TABLE chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_user_untrusted_check;

ALTER TABLE chat_messages
  ADD CONSTRAINT chat_messages_user_untrusted_check
  CHECK (role <> 'user' OR trusted = FALSE);

-- NOT VALID keeps legacy long rows intact while enforcing the bound for every
-- new or updated row. The API also applies the same limit before model calls.
ALTER TABLE chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_content_length_check;

ALTER TABLE chat_messages
  ADD CONSTRAINT chat_messages_content_length_check
  CHECK (char_length(content) <= 24000) NOT VALID;

DROP POLICY IF EXISTS "Users can create chat messages for their evaluations" ON chat_messages;

CREATE POLICY "Users can create user messages for their evaluations"
  ON chat_messages FOR INSERT
  WITH CHECK (
    role = 'user'
    AND trusted = FALSE
    AND char_length(content) <= 24000
    AND evaluation_id IN (SELECT id FROM evaluations WHERE owner = auth.uid())
  );
