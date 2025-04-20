// Middleware de autenticação para a API
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

// Configuração do cliente Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://cqkotxijjkmuuqusoaac.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxa290eGlqamttdXVxdXNvYWFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ2MzE3MTMsImV4cCI6MjA2MDIwNzcxM30.KgTPVmRdDaTMbS2ge53QXd7jDQZO2G7rxfJ49VWL1DI';
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware para verificar autenticação
const checkAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido' });
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    
    if (error || !data.user) {
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
    
    req.user = data.user;
    next();
  } catch (error) {
    console.error('Erro na verificação de autenticação:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
};

// Middleware para verificar assinatura de relacionamentos
const checkRelationshipSubscription = async (req, res, next) => {
  try {
    // Verificar se o usuário tem assinatura ativa para relacionamentos
    const { data, error } = await supabase
      .from('user_subscription')
      .select(`
        id,
        status,
        end_date,
        subscription_plans (
          id,
          type,
          features
        )
      `)
      .eq('user_id', req.user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    // Verificar se alguma assinatura ativa tem acesso a matchmaking
    const hasAccess = data.some(sub => 
      sub.status === 'active' && 
      new Date(sub.end_date) > new Date() && 
      (sub.subscription_plans.type === 'addon' || 
       (sub.subscription_plans.features && sub.subscription_plans.features.matchmaking))
    );
    
    if (!hasAccess) {
      return res.status(403).json({ 
        error: 'Acesso não autorizado. É necessário ter uma assinatura de relacionamentos ativa.',
        subscription_required: true
      });
    }
    
    next();
  } catch (error) {
    console.error('Erro ao verificar assinatura:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
};

module.exports = {
  checkAuth,
  checkRelationshipSubscription
};
