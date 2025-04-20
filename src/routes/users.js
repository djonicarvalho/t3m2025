// Rotas de usuários
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

// Obter perfil do usuário atual
router.get('/profile', checkAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.user.id)
      .single();
    
    if (error) {
      return res.status(404).json({ error: 'Perfil não encontrado' });
    }
    
    res.status(200).json(data);
  } catch (error) {
    console.error('Erro ao buscar perfil:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Atualizar perfil do usuário
router.put('/profile', checkAuth, async (req, res) => {
  try {
    const { 
      name, whatsapp, birthdate, city, state, relationship, 
      altura, peso, sexo, orientacao_sexual, tempo_estado_civil,
      parceiro_altura_min, parceiro_altura_max, parceiro_peso_min, 
      parceiro_peso_max, parceiro_idade_min, parceiro_idade_max,
      parceiro_sexo, parceiro_orientacao
    } = req.body;
    
    // Calcular IMC se altura e peso forem fornecidos
    let imc = null;
    if (altura && peso) {
      const alturaMetros = altura / 100;
      imc = peso / (alturaMetros * alturaMetros);
    }
    
    const { data, error } = await supabase
      .from('users')
      .update({ 
        name, 
        whatsapp, 
        birthdate, 
        city, 
        state, 
        relationship,
        altura,
        peso,
        imc,
        sexo,
        orientacao_sexual,
        tempo_estado_civil,
        parceiro_altura_min,
        parceiro_altura_max,
        parceiro_peso_min,
        parceiro_peso_max,
        parceiro_idade_min,
        parceiro_idade_max,
        parceiro_sexo,
        parceiro_orientacao
      })
      .eq('id', req.user.id)
      .select();
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(200).json({ 
      message: 'Perfil atualizado com sucesso',
      user: data[0]
    });
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Obter impactos emocionais desejados pelo usuário
router.get('/desired-impacts', checkAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users_impactos_desejados')
      .select(`
        id,
        tipo,
        impacto_emocional_id,
        impactos_emocionais (
          id,
          nome,
          descricao,
          tipo
        )
      `)
      .eq('user_id', req.user.id);
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(200).json(data);
  } catch (error) {
    console.error('Erro ao buscar impactos desejados:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Atualizar impactos emocionais desejados
router.post('/desired-impacts', checkAuth, async (req, res) => {
  try {
    const { impactos, tipo } = req.body;
    
    if (!impactos || !Array.isArray(impactos) || !tipo) {
      return res.status(400).json({ error: 'Formato inválido. Envie um array de IDs de impactos e o tipo (desejado/evitado)' });
    }
    
    // Primeiro remove os impactos existentes do mesmo tipo
    const { error: deleteError } = await supabase
      .from('users_impactos_desejados')
      .delete()
      .eq('user_id', req.user.id)
      .eq('tipo', tipo);
    
    if (deleteError) {
      return res.status(400).json({ error: deleteError.message });
    }
    
    // Insere os novos impactos
    const impactosData = impactos.map(impacto_emocional_id => ({
      user_id: req.user.id,
      impacto_emocional_id,
      tipo
    }));
    
    const { data, error } = await supabase
      .from('users_impactos_desejados')
      .insert(impactosData)
      .select();
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(201).json({ 
      message: 'Impactos emocionais atualizados com sucesso',
      data
    });
  } catch (error) {
    console.error('Erro ao atualizar impactos desejados:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Obter resultados dos testes do usuário
router.get('/results', checkAuth, async (req, res) => {
  try {
    // Resultados dos pilares
    const { data: pilaresData, error: pilaresError } = await supabase
      .from('resultados_pilares')
      .select(`
        id,
        nivel,
        data_calculo,
        pilares (
          id,
          codigo,
          nome,
          descricao
        )
      `)
      .eq('user_id', req.user.id);
    
    if (pilaresError) {
      return res.status(400).json({ error: pilaresError.message });
    }
    
    // Resultados dos traços emocionais
    const { data: tracosData, error: tracosError } = await supabase
      .from('resultados_tracos_emocionais')
      .select(`
        id,
        media_resposta,
        nivel_classificado,
        calculado_em,
        impactos_emocionais (
          id,
          nome,
          descricao,
          tipo
        )
      `)
      .eq('user_id', req.user.id);
    
    if (tracosError) {
      return res.status(400).json({ error: tracosError.message });
    }
    
    res.status(200).json({
      pilares: pilaresData,
      tracos_emocionais: tracosData
    });
  } catch (error) {
    console.error('Erro ao buscar resultados:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Obter assinaturas do usuário
router.get('/subscriptions', checkAuth, async (req, res) => {
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
    
    res.status(200).json(data);
  } catch (error) {
    console.error('Erro ao buscar assinaturas:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

module.exports = router;
