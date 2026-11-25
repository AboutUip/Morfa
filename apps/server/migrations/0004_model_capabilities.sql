ALTER TABLE model_provider_models
  ADD COLUMN supports_streaming INTEGER NOT NULL DEFAULT 1;

ALTER TABLE model_provider_models
  ADD COLUMN supports_thinking INTEGER NOT NULL DEFAULT 0;

ALTER TABLE model_provider_models
  ADD COLUMN supports_multimodal INTEGER NOT NULL DEFAULT 0;
