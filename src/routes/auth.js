// Rotas de autenticação
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

// Configuração do cliente Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://cqkotxijjkmuuqusoaac.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxa290eGlqamttdXVxdXNvYWFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ2MzE3MTMsImV4cCI6MjA2MDIwNzcxM30.KgTPVmRdDaTMbS2ge53QXd7jDQZO2G7rxfJ49VWL1DI';
const supabase = createClient(supabaseUrl, supabaseKey);

// Rota de registro
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, whatsapp } = req.body;

    // Validação básica
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, senha e nome são obrigatórios' });
    }

    // Registrar usuário no Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    // Criar perfil do usuário na tabela users
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert([
        { 
          id: authData.user.id,
          email,
          name,
          whatsapp,
          created_at: new Date()
        }
      ]);

    if (userError) {
      return res.status(400).json({ error: userError.message });
    }

    res.status(201).json({ 
      message: 'Usuário registrado com sucesso',
      user: authData.user
    });
  } catch (error) {
    console.error('Erro no registro:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Rota de login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validação básica
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    // Login no Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json({ error: error.message });
    }

    // Buscar dados do usuário
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (userError) {
      return res.status(404).json({ error: 'Perfil de usuário não encontrado' });
    }

    res.status(200).json({ 
      message: 'Login realizado com sucesso',
      user: userData,
      session: data.session
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Rota de logout
router.post('/logout', async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(200).json({ message: 'Logout realizado com sucesso' });
  } catch (error) {
    console.error('Erro no logout:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Rota para verificar sessão atual
router.get('/session', async (req, res) => {
  try {
    const { data, error } = await supabase.auth.getSession();
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    if (!data.session) {
      return res.status(401).json({ error: 'Nenhuma sessão ativa' });
    }

    // Buscar dados do usuário
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.session.user.id)
      .single();

    if (userError) {
      return res.status(404).json({ error: 'Perfil de usuário não encontrado' });
    }

    res.status(200).json({ 
      user: userData,
      session: data.session
    });
  } catch (error) {
    console.error('Erro ao verificar sessão:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Rota para recuperação de senha
router.post('/reset-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email é obrigatório' });
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: process.env.PASSWORD_RESET_REDIRECT_URL,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(200).json({ message: 'Email de recuperação de senha enviado' });
  } catch (error) {
    console.error('Erro na recuperação de senha:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

module.exports = router;
