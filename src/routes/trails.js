// Rotas de trilhas de desenvolvimento
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

// Obter todas as trilhas disponíveis
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('trilhas_desenvolvimento')
      .select(`
        id,
        nome,
        descricao,
        tipo,
        nivel_dificuldade,
        duracao_estimada,
        preco,
        impacto_emocional_id,
        impactos_emocionais (
          id,
          nome,
          tipo
        )
      `)
      .order('nome');
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(200).json(data);
  } catch (error) {
    console.error('Erro ao buscar trilhas:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Obter trilhas recomendadas para o usuário
router.get('/recommended', checkAuth, async (req, res) => {
  try {
    const { limite } = req.query;
    
    // Chamar função para gerar trilha personalizada
    const { data, error } = await supabase
      .rpc('gerar_trilha_personalizada_usuario', { 
        uid: req.user.id,
        limite: limite ? parseInt(limite) : 5
      });
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(200).json(data);
  } catch (error) {
    console.error('Erro ao buscar trilhas recomendadas:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Obter detalhes de uma trilha específica
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Buscar detalhes da trilha
    const { data: trilhaData, error: trilhaError } = await supabase
      .from('trilhas_desenvolvimento')
      .select(`
        id,
        nome,
        descricao,
        tipo,
        nivel_dificuldade,
        duracao_estimada,
        preco,
        impacto_emocional_id,
        impactos_emocionais (
          id,
          nome,
          descricao,
          tipo
        )
      `)
      .eq('id', id)
      .single();
    
    if (trilhaError) {
      return res.status(404).json({ error: 'Trilha não encontrada' });
    }
    
    // Buscar conteúdos da trilha
    const { data: conteudosData, error: conteudosError } = await supabase
      .from('trilha_conteudos')
      .select('*')
      .eq('trilha_id', id)
      .order('ordem');
    
    if (conteudosError) {
      return res.status(400).json({ error: conteudosError.message });
    }
    
    res.status(200).json({
      ...trilhaData,
      conteudos: conteudosData
    });
  } catch (error) {
    console.error('Erro ao buscar detalhes da trilha:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Iniciar uma trilha para o usuário
router.post('/:id/start', checkAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar se o usuário já iniciou esta trilha
    const { data: existingData, error: existingError } = await supabase
      .from('user_trilhas')
      .select('id, status')
      .eq('user_id', req.user.id)
      .eq('trilha_id', id)
      .single();
    
    if (existingError && existingError.code !== 'PGRST116') {
      return res.status(400).json({ error: existingError.message });
    }
    
    // Se já existe, verificar o status
    if (existingData) {
      if (existingData.status === 'concluida') {
        return res.status(400).json({ error: 'Você já concluiu esta trilha' });
      }
      
      if (existingData.status === 'em_andamento' || existingData.status === 'iniciada') {
        return res.status(400).json({ error: 'Você já está realizando esta trilha' });
      }
      
      // Se foi abandonada, reativar
      const { data: updatedData, error: updateError } = await supabase
        .from('user_trilhas')
        .update({ 
          status: 'iniciada',
          data_inicio: new Date(),
          progresso: 0,
          data_conclusao: null
        })
        .eq('id', existingData.id)
        .select();
      
      if (updateError) {
        return res.status(400).json({ error: updateError.message });
      }
      
      return res.status(200).json({ 
        message: 'Trilha reiniciada com sucesso',
        data: updatedData[0]
      });
    }
    
    // Verificar se o usuário tem acesso à trilha (assinatura ou compra individual)
    // Aqui seria implementada a lógica de verificação de assinatura
    
    // Iniciar a trilha
    const { data, error } = await supabase
      .from('user_trilhas')
      .insert([{
        user_id: req.user.id,
        trilha_id: id,
        progresso: 0,
        data_inicio: new Date(),
        status: 'iniciada'
      }])
      .select();
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(201).json({ 
      message: 'Trilha iniciada com sucesso',
      data: data[0]
    });
  } catch (error) {
    console.error('Erro ao iniciar trilha:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Atualizar progresso em uma trilha
router.put('/:id/progress', checkAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { progresso } = req.body;
    
    if (progresso === undefined || progresso < 0 || progresso > 100) {
      return res.status(400).json({ error: 'Progresso inválido. Deve ser um valor entre 0 e 100' });
    }
    
    // Buscar a trilha do usuário
    const { data: trilhaData, error: trilhaError } = await supabase
      .from('user_trilhas')
      .select('id, status')
      .eq('user_id', req.user.id)
      .eq('trilha_id', id)
      .single();
    
    if (trilhaError) {
      return res.status(404).json({ error: 'Trilha não encontrada ou não iniciada pelo usuário' });
    }
    
    // Atualizar o progresso
    const updateData = {
      progresso,
      status: progresso >= 100 ? 'concluida' : 'em_andamento'
    };
    
    // Se concluída, adicionar data de conclusão
    if (progresso >= 100) {
      updateData.data_conclusao = new Date();
    }
    
    const { data, error } = await supabase
      .from('user_trilhas')
      .update(updateData)
      .eq('id', trilhaData.id)
      .select();
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(200).json({ 
      message: progresso >= 100 ? 'Trilha concluída com sucesso' : 'Progresso atualizado com sucesso',
      data: data[0]
    });
  } catch (error) {
    console.error('Erro ao atualizar progresso:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Obter trilhas do usuário
router.get('/user/progress', checkAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_trilhas')
      .select(`
        id,
        progresso,
        data_inicio,
        data_conclusao,
        status,
        trilha_id,
        trilhas_desenvolvimento (
          id,
          nome,
          descricao,
          tipo,
          nivel_dificuldade,
          duracao_estimada
        )
      `)
      .eq('user_id', req.user.id)
      .order('data_inicio', { ascending: false });
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(200).json(data);
  } catch (error) {
    console.error('Erro ao buscar trilhas do usuário:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

module.exports = router;
