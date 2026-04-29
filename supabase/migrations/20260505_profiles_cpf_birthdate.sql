-- =========================================
-- Perfil obrigatório do usuário (após criar a empresa).
-- Adiciona CPF e data de nascimento ao perfil.
-- O front-end exige que avatar_url, full_name, phone, cpf e birth_date
-- estejam preenchidos antes de liberar acesso ao app.
-- =========================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cpf TEXT,
  ADD COLUMN IF NOT EXISTS birth_date DATE;

-- CPF é único por usuário (1 perfil = 1 CPF) quando preenchido.
-- Permite NULL para perfis legados ainda não completados.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_cpf_unique
  ON public.profiles (cpf)
  WHERE cpf IS NOT NULL;
