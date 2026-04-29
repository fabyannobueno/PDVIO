-- =========================================
-- Perfil obrigatório do usuário (após criar a empresa).
-- Adiciona CPF, data de nascimento e flag de perfil completo.
-- O front-end exige profile_completed = TRUE para liberar acesso ao app.
-- Usuários antigos terão profile_completed = FALSE e serão obrigados
-- a completar o perfil no próximo acesso.
-- =========================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cpf TEXT,
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- CPF é único por usuário (1 perfil = 1 CPF) quando preenchido.
-- Permite NULL para perfis legados ainda não completados.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_cpf_unique
  ON public.profiles (cpf)
  WHERE cpf IS NOT NULL;
