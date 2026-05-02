-- Adiciona Cardápio Digital, Mesa QR Code e Delivery nos features dos planos Essencial e Pro
UPDATE public.plans
SET features = '["Até 2 lojas","Até 1.000 produtos","3 usuários por loja","Comandas e mesas","Cardápio Digital","Mesa QR Code","Delivery","Suporte por chat"]'::jsonb
WHERE id = 'essencial';

UPDATE public.plans
SET features = '["Multi-loja até 10 lojas","Usuários e caixas ilimitados","Produtos ilimitados","KDS (Tela da cozinha)","Cardápio Digital","Mesa QR Code","Delivery","Estoque, fichas e BI completo","Suporte prioritário via WhatsApp"]'::jsonb
WHERE id = 'pro';
