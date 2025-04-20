// Rotas de resultados
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

// Obter resultados completos do usuário
router.get('/complete', checkAuth, async (req, res) => {
  try {
    // Chamar função para montar resultado final
    const { data: resultadoFinal, error: resultadoError } = await supabase
      .rpc('montar_resultado_final', { uid: req.user.id });
    
    if (resultadoError) {
      return res.status(400).json({ error: resultadoError.message });
    }
    
    // Buscar resultados dos pilares
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
    
    // Buscar resultados dos traços emocionais
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
    
    // Gerar parceiro ideal
    const { data: parceiroIdeal, error: parceiroError } = await supabase
      .rpc('gerar_parceiro_ideal', { uid: req.user.id });
    
    if (parceiroError) {
      return res.status(400).json({ error: parceiroError.message });
    }
    
    res.status(200).json({
      resultado_final: resultadoFinal,
      pilares: pilaresData,
      tracos_emocionais: tracosData,
      parceiro_ideal: parceiroIdeal
    });
  } catch (error) {
    console.error('Erro ao buscar resultados completos:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Obter histórico de resultados do usuário
router.get('/history', checkAuth, async (req, res) => {
  try {
    // Buscar histórico de resultados dos pilares
    const { data: historicoData, error: historicoError } = await supabase
      .from('resultados_pilares')
      .select(`
        id,
        nivel,
        data_calculo,
        pilares (
          id,
          codigo,
          nome
        )
      `)
      .eq('user_id', req.user.id)
      .order('data_calculo', { ascending: false });
    
    if (historicoError) {
      return res.status(400).json({ error: historicoError.message });
    }
    
    // Organizar os dados por data
    const historicoPorData = {};
    
    historicoData.forEach(item => {
      const data = new Date(item.data_calculo).toISOString().split('T')[0];
      
      if (!historicoPorData[data]) {
        historicoPorData[data] = [];
      }
      
      historicoPorData[data].push(item);
    });
    
    res.status(200).json(historicoPorData);
  } catch (error) {
    console.error('Erro ao buscar histórico de resultados:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Obter frases para composição de resultados
router.get('/phrases', async (req, res) => {
  try {
    const { contexto, pilar, nivel } = req.query;
    
    let query = supabase
      .from('frases_concatenadas')
      .select('*');
    
    if (contexto) {
      query = query.eq('contexto', contexto);
    }
    
    if (pilar) {
      query = query.eq('pilar', pilar);
    }
    
    if (nivel) {
      query = query.eq('nivel', nivel);
    }
    
    const { data, error } = await query;
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(200).json(data);
  } catch (error) {
    console.error('Erro ao buscar frases:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Avaliar coerência do usuário (entre o que espera e o que oferece)
router.get('/coherence', checkAuth, async (req, res) => {
  try {
    // Chamar função para avaliar coerência
    const { data, error } = await supabase
      .rpc('avaliar_coerencia_usuario', { uid: req.user.id });
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(200).json(data);
  } catch (error) {
    console.error('Erro ao avaliar coerência:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

module.exports = router;
