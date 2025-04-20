// Rotas de testes
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

// Obter todos os tipos de avaliação
router.get('/types', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('avaliacoes')
      .select('*')
      .order('id');
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(200).json(data);
  } catch (error) {
    console.error('Erro ao buscar tipos de avaliação:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Obter perguntas de um teste específico
router.get('/:avaliacaoId/questions', async (req, res) => {
  try {
    const { avaliacaoId } = req.params;
    
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('avaliacao_id', avaliacaoId)
      .order('ordem');
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(200).json(data);
  } catch (error) {
    console.error('Erro ao buscar perguntas:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Obter todos os pilares emocionais
router.get('/pillars', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('pilares')
      .select(`
        *,
        pilar_detalhes (*)
      `)
      .order('id');
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(200).json(data);
  } catch (error) {
    console.error('Erro ao buscar pilares:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Obter todos os impactos emocionais
router.get('/impacts', async (req, res) => {
  try {
    const { tipo } = req.query;
    let query = supabase
      .from('impactos_emocionais')
      .select('*')
      .order('nome');
    
    if (tipo) {
      query = query.eq('tipo', tipo);
    }
    
    const { data, error } = await query;
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(200).json(data);
  } catch (error) {
    console.error('Erro ao buscar impactos emocionais:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Salvar respostas de um teste
router.post('/:avaliacaoId/responses', checkAuth, async (req, res) => {
  try {
    const { avaliacaoId } = req.params;
    const { respostas } = req.body;
    
    if (!respostas || !Array.isArray(respostas)) {
      return res.status(400).json({ error: 'Formato inválido. Envie um array de respostas' });
    }
    
    // Formatar as respostas para inserção
    const responsesData = respostas.map(({ questionId, resposta }) => ({
      user_id: req.user.id,
      question_id: questionId,
      resposta,
      data_resposta: new Date()
    }));
    
    // Inserir as respostas
    const { data, error } = await supabase
      .from('responses')
      .insert(responsesData)
      .select();
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    // Calcular resultados com base no tipo de avaliação
    let resultMessage = 'Respostas salvas com sucesso';
    let resultData = null;
    
    // Verificar o tipo de avaliação
    const { data: avaliacaoData, error: avaliacaoError } = await supabase
      .from('avaliacoes')
      .select('tipo')
      .eq('id', avaliacaoId)
      .single();
    
    if (avaliacaoError) {
      return res.status(400).json({ error: avaliacaoError.message });
    }
    
    // Calcular resultados específicos com base no tipo de avaliação
    switch (avaliacaoData.tipo) {
      case 'principal':
        // Chamar função para calcular níveis dos pilares
        const { data: pilaresResult, error: pilaresError } = await supabase
          .rpc('calcular_niveis_usuario', { uid: req.user.id });
        
        if (pilaresError) {
          return res.status(400).json({ error: pilaresError.message });
        }
        
        // Salvar resultados dos pilares
        const { data: savedPilares, error: saveError } = await supabase
          .rpc('salvar_resultados_usuario', { uid: req.user.id });
        
        if (saveError) {
          return res.status(400).json({ error: saveError.message });
        }
        
        resultMessage = 'Teste de personalidade concluído com sucesso';
        resultData = pilaresResult;
        break;
        
      case 'tracos':
        // Chamar função para calcular traços emocionais
        const { data: tracosResult, error: tracosError } = await supabase
          .rpc('calcular_tracos_emocionais', { uid: req.user.id });
        
        if (tracosError) {
          return res.status(400).json({ error: tracosError.message });
        }
        
        // Salvar resultados dos traços
        const { data: savedTracos, error: saveTracosError } = await supabase
          .rpc('salvar_tracos_emocionais', { uid: req.user.id });
        
        if (saveTracosError) {
          return res.status(400).json({ error: saveTracosError.message });
        }
        
        resultMessage = 'Teste de traços emocionais concluído com sucesso';
        resultData = tracosResult;
        break;
        
      case 'trilha_esperada':
      case 'trilha_entregue':
        // Processar resultados para trilhas
        resultMessage = `Teste de ${avaliacaoData.tipo === 'trilha_esperada' ? 'expectativas' : 'oferecimento'} concluído com sucesso`;
        break;
    }
    
    res.status(201).json({ 
      message: resultMessage,
      data: resultData
    });
  } catch (error) {
    console.error('Erro ao salvar respostas:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Verificar compatibilidade entre perfis
router.post('/compatibility', async (req, res) => {
  try {
    const { chave1, chave2 } = req.body;
    
    if (!chave1 || !chave2) {
      return res.status(400).json({ error: 'Ambas as chaves são obrigatórias' });
    }
    
    // Buscar compatibilidade no banco de dados
    let { data, error } = await supabase
      .from('compatibilidade')
      .select(`
        *,
        compatibilidade_descricao (*)
      `)
      .or(`chave1.eq.${chave1},chave1.eq.${chave2}`)
      .or(`chave2.eq.${chave1},chave2.eq.${chave2}`)
      .single();
    
    // Se não encontrar, calcular a compatibilidade
    if (error || !data) {
      // Aqui seria chamada uma função para calcular a compatibilidade
      // Por enquanto, retornamos um valor padrão
      return res.status(200).json({
        status: 'calculado',
        compatibilidade: 65,
        descricao: 'Compatibilidade moderada. Vocês têm algumas áreas de sintonia, mas também diferenças significativas que precisarão de atenção.'
      });
    }
    
    res.status(200).json(data);
  } catch (error) {
    console.error('Erro ao verificar compatibilidade:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

module.exports = router;
