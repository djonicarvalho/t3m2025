// Rotas de matches e relacionamentos (T3M)
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

// Obter perfis compatíveis para o usuário
router.get('/potential', checkAuth, checkRelationshipSubscription, async (req, res) => {
  try {
    const { limit = 10, offset = 0 } = req.query;
    
    // Buscar dados do usuário atual
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.user.id)
      .single();
    
    if (userError) {
      return res.status(404).json({ error: 'Perfil de usuário não encontrado' });
    }
    
    // Construir consulta para encontrar perfis compatíveis
    let query = supabase
      .from('users')
      .select(`
        id,
        name,
        city,
        state,
        relationship,
        profile_key,
        perfil_me,
        perfil_er,
        perfil_ev,
        perfil_pr,
        perfil_sx,
        perfil_sa,
        perfil_dp,
        altura,
        peso,
        sexo,
        orientacao_sexual,
        idade:extract(year from age(birthdate))
      `)
      .neq('id', req.user.id);
    
    // Filtrar por preferências de sexo e orientação
    if (userData.parceiro_sexo) {
      query = query.eq('sexo', userData.parceiro_sexo);
    }
    
    if (userData.parceiro_orientacao) {
      query = query.eq('orientacao_sexual', userData.parceiro_orientacao);
    }
    
    // Filtrar por faixa de altura
    if (userData.parceiro_altura_min && userData.parceiro_altura_max) {
      query = query.gte('altura', userData.parceiro_altura_min)
                   .lte('altura', userData.parceiro_altura_max);
    }
    
    // Filtrar por faixa de peso
    if (userData.parceiro_peso_min && userData.parceiro_peso_max) {
      query = query.gte('peso', userData.parceiro_peso_min)
                   .lte('peso', userData.parceiro_peso_max);
    }
    
    // Filtrar por faixa de idade
    if (userData.parceiro_idade_min && userData.parceiro_idade_max) {
      query = query.gte('idade', userData.parceiro_idade_min)
                   .lte('idade', userData.parceiro_idade_max);
    }
    
    // Aplicar paginação
    query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)
                 .order('created_at', { ascending: false });
    
    const { data, error } = await query;
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    // Calcular compatibilidade para cada perfil
    const profilesWithCompatibility = await Promise.all(data.map(async (profile) => {
      // Verificar se já existe um match com este usuário
      const { data: matchData, error: matchError } = await supabase
        .from('user_matches')
        .select('id, status')
        .or(`user_id.eq.${req.user.id},match_user_id.eq.${req.user.id}`)
        .or(`user_id.eq.${profile.id},match_user_id.eq.${profile.id}`)
        .single();
      
      // Calcular compatibilidade básica
      let compatibilityScore = 0;
      let totalFactors = 0;
      
      // Comparar pilares emocionais
      const pilares = ['perfil_me', 'perfil_er', 'perfil_ev', 'perfil_pr', 'perfil_sx', 'perfil_sa', 'perfil_dp'];
      
      pilares.forEach(pilar => {
        if (userData[pilar] && profile[pilar]) {
          const userLevel = parseInt(userData[pilar].replace(/[^0-9]/g, ''));
          const profileLevel = parseInt(profile[pilar].replace(/[^0-9]/g, ''));
          
          if (!isNaN(userLevel) && !isNaN(profileLevel)) {
            const difference = Math.abs(userLevel - profileLevel);
            const factor = 1 - (difference / 5); // 5 é o máximo de diferença possível
            compatibilityScore += factor;
            totalFactors++;
          }
        }
      });
      
      // Calcular porcentagem final
      const compatibilityPercentage = totalFactors > 0 
        ? Math.round((compatibilityScore / totalFactors) * 100) 
        : 50; // Valor padrão se não houver dados suficientes
      
      return {
        ...profile,
        compatibility: compatibilityPercentage,
        match_status: matchData ? matchData.status : null
      };
    }));
    
    // Ordenar por compatibilidade
    profilesWithCompatibility.sort((a, b) => b.compatibility - a.compatibility);
    
    res.status(200).json(profilesWithCompatibility);
  } catch (error) {
    console.error('Erro ao buscar perfis compatíveis:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Enviar solicitação de match
router.post('/request', checkAuth, checkRelationshipSubscription, async (req, res) => {
  try {
    const { userId, mensagem } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'ID do usuário é obrigatório' });
    }
    
    if (!mensagem || mensagem.trim().length < 10) {
      return res.status(400).json({ error: 'Mensagem inicial é obrigatória e deve ter pelo menos 10 caracteres' });
    }
    
    // Verificar se o usuário alvo existe
    const { data: targetUser, error: targetError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();
    
    if (targetError) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    // Verificar se já existe um match entre os usuários
    const { data: existingMatch, error: matchError } = await supabase
      .from('user_matches')
      .select('*')
      .or(`user_id.eq.${req.user.id},match_user_id.eq.${req.user.id}`)
      .or(`user_id.eq.${userId},match_user_id.eq.${userId}`);
    
    if (matchError) {
      return res.status(400).json({ error: matchError.message });
    }
    
    if (existingMatch && existingMatch.length > 0) {
      return res.status(400).json({ error: 'Já existe uma solicitação de match com este usuário' });
    }
    
    // Verificar limite de 3 matches ativos
    const { data: activeMatches, error: activeError } = await supabase
      .from('user_matches')
      .select('id')
      .eq('user_id', req.user.id)
      .in('status', ['pendente', 'aceito']);
    
    if (activeError) {
      return res.status(400).json({ error: activeError.message });
    }
    
    if (activeMatches && activeMatches.length >= 3) {
      return res.status(400).json({ 
        error: 'Você já atingiu o limite de 3 matches ativos. Finalize algum match para iniciar um novo.'
      });
    }
    
    // Criar solicitação de match
    const { data, error } = await supabase
      .from('user_matches')
      .insert([{
        user_id: req.user.id,
        match_user_id: userId,
        status: 'pendente',
        mensagem_inicial: mensagem,
        data_match: new Date()
      }])
      .select();
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(201).json({ 
      message: 'Solicitação de match enviada com sucesso',
      match: data[0]
    });
  } catch (error) {
    console.error('Erro ao enviar solicitação de match:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Responder a uma solicitação de match
router.put('/:id/respond', checkAuth, checkRelationshipSubscription, async (req, res) => {
  try {
    const { id } = req.params;
    const { aceitar } = req.body;
    
    if (aceitar === undefined) {
      return res.status(400).json({ error: 'É necessário informar se aceita ou recusa o match' });
    }
    
    // Verificar se a solicitação existe e é destinada ao usuário
    const { data: matchData, error: matchError } = await supabase
      .from('user_matches')
      .select('*')
      .eq('id', id)
      .eq('match_user_id', req.user.id)
      .eq('status', 'pendente')
      .single();
    
    if (matchError) {
      return res.status(404).json({ error: 'Solicitação de match não encontrada ou já respondida' });
    }
    
    // Atualizar status do match
    const { data, error } = await supabase
      .from('user_matches')
      .update({ 
        status: aceitar ? 'aceito' : 'recusado'
      })
      .eq('id', id)
      .select();
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(200).json({ 
      message: aceitar ? 'Match aceito com sucesso' : 'Match recusado',
      match: data[0]
    });
  } catch (error) {
    console.error('Erro ao responder solicitação de match:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Finalizar um match
router.put('/:id/finalize', checkAuth, checkRelationshipSubscription, async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    
    // Verificar se o match existe e pertence ao usuário
    const { data: matchData, error: matchError } = await supabase
      .from('user_matches')
      .select('*')
      .eq('id', id)
      .or(`user_id.eq.${req.user.id},match_user_id.eq.${req.user.id}`)
      .in('status', ['pendente', 'aceito'])
      .single();
    
    if (matchError) {
      return res.status(404).json({ error: 'Match não encontrado ou já finalizado' });
    }
    
    // Atualizar status do match
    const { data, error } = await supabase
      .from('user_matches')
      .update({ 
        status: 'finalizado',
        motivo_finalizacao: motivo,
        data_finalizacao: new Date()
      })
      .eq('id', id)
      .select();
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(200).json({ 
      message: 'Match finalizado com sucesso',
      match: data[0]
    });
  } catch (error) {
    console.error('Erro ao finalizar match:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Liberar contato em um match
router.put('/:id/release-contact', checkAuth, checkRelationshipSubscription, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar se o match existe, está aceito e pertence ao usuário
    const { data: matchData, error: matchError } = await supabase
      .from('user_matches')
      .select('*')
      .eq('id', id)
      .or(`user_id.eq.${req.user.id},match_user_id.eq.${req.user.id}`)
      .eq('status', 'aceito')
      .single();
    
    if (matchError) {
      return res.status(404).json({ error: 'Match não encontrado ou não está em estado aceito' });
    }
    
    // Atualizar status do contato
    const { data, error } = await supabase
      .from('user_matches')
      .update({ 
        contato_liberado: true
      })
      .eq('id', id)
      .select();
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(200).json({ 
      message: 'Contato liberado com sucesso',
      match: data[0]
    });
  } catch (error) {
    console.error('Erro ao liberar contato:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Obter matches do usuário
router.get('/user', checkAuth, checkRelationshipSubscription, async (req, res) => {
  try {
    const { status } = req.query;
    
    let query = supabase
      .from('user_matches')
      .select(`
        id,
        status,
        mensagem_inicial,
        data_match,
        data_finalizacao,
        motivo_finalizacao,
        contato_liberado,
        user: user_id (
          id,
          name,
          city,
          state,
          profile_key
        ),
        match_user: match_user_id (
          id,
          name,
          city,
          state,
          profile_key
        )
      `)
      .or(`user_id.eq.${req.user.id},match_user_id.eq.${req.user.id}`);
    
    if (status) {
      query = query.eq('status', status);
    }
    
    query = query.order('data_match', { ascending: false });
    
    const { data, error } = await query;
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    // Formatar os dados para facilitar o uso no frontend
    const formattedMatches = data.map(match => {
      const isInitiator = match.user.id === req.user.id;
      const otherUser = isInitiator ? match.match_user : match.user;
      
      return {
        id: match.id,
        status: match.status,
        mensagem_inicial: match.mensagem_inicial,
        data_match: match.data_match,
        data_finalizacao: match.data_finalizacao,
        motivo_finalizacao: match.motivo_finalizacao,
        contato_liberado: match.contato_liberado,
        is_initiator: isInitiator,
        other_user: otherUser
      };
    });
    
    res.status(200).json(formattedMatches);
  } catch (error) {
    console.error('Erro ao buscar matches:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Enviar mensagem em um match
router.post('/:id/messages', checkAuth, checkRelationshipSubscription, async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    
    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Mensagem não pode estar vazia' });
    }
    
    // Verificar se o match existe, está aceito e pertence ao usuário
    const { data: matchData, error: matchError } = await supabase
      .from('user_matches')
      .select('*')
      .eq('id', id)
      .or(`user_id.eq.${req.user.id},match_user_id.eq.${req.user.id}`)
      .eq('status', 'aceito')
      .single();
    
    if (matchError) {
      return res.status(404).json({ error: 'Match não encontrado ou não está em estado aceito' });
    }
    
    // Enviar mensagem
    const { data, error } = await supabase
      .from('user_messages')
      .insert([{
        match_id: id,
        sender_id: req.user.id,
        message,
        sent_at: new Date()
      }])
      .select();
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(201).json({ 
      message: 'Mensagem enviada com sucesso',
      data: data[0]
    });
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Obter mensagens de um match
router.get('/:id/messages', checkAuth, checkRelationshipSubscription, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar se o match existe e pertence ao usuário
    const { data: matchData, error: matchError } = await supabase
      .from('user_matches')
      .select('*')
      .eq('id', id)
      .or(`user_id.eq.${req.user.id},match_user_id.eq.${req.user.id}`)
      .single();
    
    if (matchError) {
      return res.status(404).json({ error: 'Match não encontrado' });
    }
    
    // Buscar mensagens
    const { data, error } = await supabase
      .from('user_messages')
      .select(`
        id,
        message,
        sent_at,
        read_at,
        sender: sender_id (
          id,
          name
        )
      `)
      .eq('match_id', id)
      .order('sent_at');
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    // Marcar mensagens como lidas
    const messagesToUpdate = data
      .filter(msg => msg.sender.id !== req.user.id && !msg.read_at)
      .map(msg => msg.id);
    
    if (messagesToUpdate.length > 0) {
      await supabase
        .from('user_messages')
        .update({ read_at: new Date() })
        .in('id', messagesToUpdate);
    }
    
    res.status(200).json(data);
  } catch (error) {
    console.error('Erro ao buscar mensagens:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

module.exports = router;
