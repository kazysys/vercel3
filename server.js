const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const session = require('express-session');
const expressEjsLayout = require('express-ejs-layouts'); // Adicionei o express-ejs-layouts
const mercadopago = require('mercadopago'); // Importa o SDK do Mercado Pago
const app = express();

app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
    secret: 'segredo',
    resave: false,
    saveUninitialized: true,
}));



// Conexão com o MongoDB
mongoose.connect('mongodb+srv://HorizonCloud2024:HorizonCloud2024@horizoncloud.xfhyw.mongodb.net/?retryWrites=true&w=majority&appName=horizoncloud')
    .then(() => {
        console.log('Conectado ao MongoDB');
    })
    .catch(err => {
        console.error('Erro ao conectar ao MongoDB:', err);
    });

// Atualização no userSchema para incluir planos e a propriedade isAdmin
const userSchema = new mongoose.Schema({
    nome: String,
    email: String,
    senha: String,
    isAdmin: { type: Boolean, default: false }, // Novo campo para administrador
    planos: [{
        nome: String,
        preco: Number,
        dataCompra: Date,
        proximaRenovacao: Date,
    }]
});

const User = mongoose.model('User', userSchema);

app.use(express.static(path.join(__dirname, 'public')));

// Configurações do EJS
app.use(expressEjsLayout); // Para usar layouts, se necessário

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login.html', async (req, res) => {
    const { email, senha } = req.body;

    try {
        const user = await User.findOne({ email: email });

        if (user) {
            const match = await bcrypt.compare(senha, user.senha);
            if (match) {
                req.session.userId = user._id;
                return res.redirect('/dashboard');
            } else {
                res.redirect('/login?error=true'); // Redireciona para o login em caso de erro
            }
        } else {
            res.redirect('/login?error=true'); // Redireciona para o login em caso de erro
        }
    } catch (err) {
        res.status(400).send('Erro ao processar o login: ' + err);
    }
});

function checkAuth(req, res, next) {
    if (req.session.userId) {
        return next();
    }
    res.redirect('/login');
}

// Rota para a página de sucesso (protegida)
app.get('/dashboard.html', checkAuth, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        res.render('dashboard.html', { planos: user.planos }); // Passa os planos para a view
    } catch (err) {
        res.status(500).send('Erro ao carregar dashboard.');
    }
});

app.get('/register.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

app.post('/register', async (req, res) => {
    const { nome, email, senha } = req.body;

    try {
        const userExists = await User.findOne({ email: email });
        if (userExists) {
            return res.send('Usuário já cadastrado.');
        }

        const hashedPassword = await bcrypt.hash(senha, 10);
        const novoUsuario = new User({ nome, email, senha: hashedPassword });

        await novoUsuario.save();
        // Redireciona para a página de registro com uma notificação
        res.redirect('/register?success=true');
    } catch (err) {
        res.status(400).send('Erro ao registrar usuário: ' + err);
    }
});

// Rota para processar pagamento
app.post('/pagamento', async (req, res) => {
    const { nomePlano, precoPlano } = req.body;

    const paymentData = {
        transaction_amount: parseFloat(precoPlano),
        token: req.body.token, // O token recebido do frontend (p. ex., do formulário de pagamento)
        description: `Pagamento pelo plano ${nomePlano}`,
        payment_method_id: req.body.paymentMethodId,
        payer: {
            email: req.body.payerEmail,
        },
        notification_url: 'https://www.your-site.com/pagamento-aprovado', // URL para receber notificações
    };

    try {
        const payment = await mercadopago.payment.create(paymentData);
        const userId = req.session.userId;
        
        // Atualizar o usuário no banco de dados após pagamento aprovado
        if (payment.status === 'approved') {
            const plano = {
                nome: nomePlano,
                preco: precoPlano,
                dataCompra: new Date(),
                proximaRenovacao: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias após a compra
            };

            await User.findByIdAndUpdate(userId, { $push: { planos: plano } });
            return res.redirect('/sucesso'); // Redireciona para a página de sucesso
        } else {
            res.status(400).send('Pagamento não aprovado.');
        }
    } catch (err) {
        console.error('Erro ao processar pagamento:', err);
        res.status(500).send('Erro ao processar pagamento.');
    }
});

// Rota para a página de administração (protegida)
app.get('/admin', checkAuth, async (req, res) => {
    const user = await User.findById(req.session.userId);
    
    // Verifica se o usuário é admin
    if (!user.isAdmin) {
        return res.status(403).send('Acesso negado');
    }

    const usuarios = await User.find(); // Busca todos os usuários
    res.render('admin', { usuarios });
});

// Rota para adicionar plano a um usuário
app.post('/admin/adicionar-plano', checkAuth, async (req, res) => {
    const { userId, nomePlano, precoPlano } = req.body;

    const adminUser = await User.findById(req.session.userId);
    if (!adminUser.isAdmin) {
        return res.status(403).send('Acesso negado');
    }

    const plano = {
        nome: nomePlano,
        preco: precoPlano,
        dataCompra: new Date(),
        proximaRenovacao: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 dias após a compra
    };

    try {
        await User.findByIdAndUpdate(userId, { $push: { planos: plano } });
        res.redirect('/admin'); // Redireciona para a página de administração
    } catch (err) {
        console.error('Erro ao adicionar plano:', err);
        res.status(500).send('Erro ao adicionar plano.');
    }
});

// Rota para remover plano de um usuário
app.post('/admin/remover-plano', checkAuth, async (req, res) => {
    const { userId, planoId } = req.body;

    const adminUser = await User.findById(req.session.userId);
    if (!adminUser.isAdmin) {
        return res.status(403).send('Acesso negado');
    }

    try {
        await User.findByIdAndUpdate(userId, { $pull: { planos: { _id: planoId } } });
        res.redirect('/admin'); // Redireciona para a página de administração
    } catch (err) {
        console.error('Erro ao remover plano:', err);
        res.status(500).send('Erro ao remover plano.');
    }
});

// Rota para adicionar dias a um plano
app.post('/admin/adicionar-dias', checkAuth, async (req, res) => {
    const { userId, planoId, dias } = req.body;

    const adminUser = await User.findById(req.session.userId);
    if (!adminUser.isAdmin) {
        return res.status(403).send('Acesso negado');
    }

    try {
        const user = await User.findById(userId);
        const plano = user.planos.id(planoId);
        
        if (plano) {
            plano.proximaRenovacao = new Date(plano.proximaRenovacao.getTime() + dias * 24 * 60 * 60 * 1000);
            await user.save();
            res.redirect('/admin'); // Redireciona para a página de administração
        } else {
            res.status(404).send('Plano não encontrado');
        }
    } catch (err) {
        console.error('Erro ao adicionar dias:', err);
        res.status(500).send('Erro ao adicionar dias ao plano.');
    }
});

// Rota para tornar um usuário admin
app.post('/admin/tornar-admin', checkAuth, async (req, res) => {
    const { userId } = req.body;

    const adminUser = await User.findById(req.session.userId);
    if (!adminUser.isAdmin) {
        return res.status(403).send('Acesso negado');
    }

    try {
        await User.findByIdAndUpdate(userId, { isAdmin: true });
        res.redirect('/admin'); // Redireciona para a página de administração
    } catch (err) {
        console.error('Erro ao tornar usuário admin:', err);
        res.status(500).send('Erro ao tornar usuário admin.');
    }
});

// Rota para deletar um usuário
app.post('/admin/deletar-usuario', checkAuth, async (req, res) => {
    const { userId } = req.body;

    const adminUser = await User.findById(req.session.userId);
    if (!adminUser.isAdmin) {
        return res.status(403).send('Acesso negado');
    }

    try {
        await User.findByIdAndDelete(userId);
        res.redirect('/admin'); // Redireciona para a página de administração
    } catch (err) {
        console.error('Erro ao deletar usuário:', err);
        res.status(500).send('Erro ao deletar usuário.');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor online rodando na porta ${PORT}`);
});
