// Rotas de assinaturas
const express = require('express');
const router = express.Router();
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

// Obter todos os planos de assinatura
router.get('/plans', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .order('price');
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(200).json(data);
  } catch (error) {
    console.error('Erro ao buscar planos:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Obter assinaturas do usuário
router.get('/user', checkAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_subscription')
      .select(`
        id,
        status,
        start_date,
        end_date,
        payment_method,
        created_at,
        subscription_plans (
          id,
          name,
          description,
          price,
          type,
          features
        )
      `)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    // Verificar assinatura ativa
    const activeSubscription = data.find(sub => 
      sub.status === 'active' && new Date(sub.end_date) > new Date()
    );
    
    res.status(200).json({
      subscriptions: data,
      active: activeSubscription || null
    });
  } catch (error) {
    console.error('Erro ao buscar assinaturas:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Iniciar processo de assinatura
router.post('/checkout', checkAuth, async (req, res) => {
  try {
    const { planId, paymentMethod } = req.body;
    
    if (!planId) {
      return res.status(400).json({ error: 'ID do plano é obrigatório' });
    }
    
    // Buscar detalhes do plano
    const { data: planData, error: planError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', planId)
      .single();
    
    if (planError) {
      return res.status(404).json({ error: 'Plano não encontrado' });
    }
    
    // Aqui seria implementada a integração com o gateway de pagamento
    // Por enquanto, simulamos uma resposta de sucesso
    
    // Criar assinatura
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + planData.duration);
    
    const { data, error } = await supabase
      .from('user_subscription')
      .insert([{
        user_id: req.user.id,
        plan_id: planId,
        status: 'active',
        start_date: startDate,
        end_date: endDate,
        payment_method: paymentMethod || 'credit_card',
        created_at: new Date()
      }])
      .select();
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    // Registrar transação de pagamento
    const { data: paymentData, error: paymentError } = await supabase
      .from('payment_transactions')
      .insert([{
        user_id: req.user.id,
        subscription_id: data[0].id,
        amount: planData.price,
        gateway: paymentMethod === 'pagseguro' ? 'pagseguro' : 'vindi',
        gateway_transaction_id: `sim_${Date.now()}`,
        status: 'approved',
        created_at: new Date(),
        updated_at: new Date()
      }])
      .select();
    
    if (paymentError) {
      console.error('Erro ao registrar transação:', paymentError);
    }
    
    res.status(201).json({ 
      message: 'Assinatura realizada com sucesso',
      subscription: data[0],
      payment: paymentData ? paymentData[0] : null
    });
  } catch (error) {
    console.error('Erro ao processar assinatura:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Cancelar assinatura
router.post('/:id/cancel', checkAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar se a assinatura existe e pertence ao usuário
    const { data: subData, error: subError } = await supabase
      .from('user_subscription')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();
    
    if (subError) {
      return res.status(404).json({ error: 'Assinatura não encontrada' });
    }
    
    if (subData.status !== 'active') {
      return res.status(400).json({ error: 'Assinatura já está cancelada ou expirada' });
    }
    
    // Aqui seria implementada a integração com o gateway de pagamento para cancelamento
    
    // Atualizar status da assinatura
    const { data, error } = await supabase
      .from('user_subscription')
      .update({ 
        status: 'canceled',
        end_date: new Date() // Encerra imediatamente
      })
      .eq('id', id)
      .select();
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(200).json({ 
      message: 'Assinatura cancelada com sucesso',
      subscription: data[0]
    });
  } catch (error) {
    console.error('Erro ao cancelar assinatura:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Comprar trilha individual
router.post('/purchase-trail', checkAuth, async (req, res) => {
  try {
    const { trailId, paymentMethod } = req.body;
    
    if (!trailId) {
      return res.status(400).json({ error: 'ID da trilha é obrigatório' });
    }
    
    // Buscar detalhes da trilha
    const { data: trailData, error: trailError } = await supabase
      .from('trilhas_desenvolvimento')
      .select('*')
      .eq('id', trailId)
      .single();
    
    if (trailError) {
      return res.status(404).json({ error: 'Trilha não encontrada' });
    }
    
    // Aqui seria implementada a integração com o gateway de pagamento
    
    // Registrar transação de pagamento
    const { data, error } = await supabase
      .from('payment_transactions')
      .insert([{
        user_id: req.user.id,
        trilha_id: trailId,
        amount: trailData.preco,
        gateway: paymentMethod === 'pagseguro' ? 'pagseguro' : 'vindi',
        gateway_transaction_id: `sim_trail_${Date.now()}`,
        status: 'approved',
        created_at: new Date(),
        updated_at: new Date()
      }])
      .select();
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    // Iniciar a trilha para o usuário
    const { data: trilhaData, error: trilhaError } = await supabase
      .from('user_trilhas')
      .insert([{
        user_id: req.user.id,
        trilha_id: trailId,
        progresso: 0,
        data_inicio: new Date(),
        status: 'iniciada'
      }])
      .select();
    
    if (trilhaError) {
      console.error('Erro ao iniciar trilha:', trilhaError);
    }
    
    res.status(201).json({ 
      message: 'Trilha adquirida com sucesso',
      payment: data[0],
      trail_progress: trilhaData ? trilhaData[0] : null
    });
  } catch (error) {
    console.error('Erro ao processar compra de trilha:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

module.exports = router;
