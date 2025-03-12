const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs').promises;  // Usando fs.promises para operações assíncronas

const contactsFile = './contacts.json';
const TIMEOUT = 5 * 60 * 1000;  // 5 minutos em milissegundos

// Função para carregar os contatos armazenados
const loadContacts = async () => {
    try {
        // Verifica se o arquivo existe e lê o conteúdo
        await fs.access(contactsFile);  // Verifica se o arquivo existe
        const data = await fs.readFile(contactsFile, 'utf-8');  // Lê o arquivo
        return JSON.parse(data);  // Converte de volta para o formato de objeto
    } catch (err) {
        // Se o arquivo não existir ou ocorrer algum erro, retorna uma lista vazia
        return [];
    }
};

// Função para salvar os contatos no arquivo
const saveContacts = async (contacts) => {
    try {
        // Escreve os contatos no arquivo de forma assíncrona
        await fs.writeFile(contactsFile, JSON.stringify(contacts, null, 2), 'utf-8');
    } catch (err) {
        console.error('Erro ao salvar contatos:', err);
    }
};

// Função para apagar os contatos (iniciar fila nova)
const clearContacts = async () => {
    try {
        // Cria um arquivo vazio (reseta os contatos)
        await fs.writeFile(contactsFile, JSON.stringify([]), 'utf-8');
    } catch (err) {
        console.error('Erro ao limpar contatos:', err);
    }
};

// Inicializando o cliente do WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
});

// Quando o cliente estiver pronto
client.on('ready', () => {
    console.log('Client is ready!');
    // Limpa os contatos toda vez que o sistema for inicializado
    clearContacts(); // Começar uma nova fila de atendimento
});

// Gerar o QR Code
client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
});

// Função para encerrar automaticamente o atendimento após 5 minutos de inatividade
const checkTimeouts = async () => {
    const contacts = await loadContacts();
    const now = Date.now();

    // Verificar cada contato para ver se passou mais de 5 minutos desde a última interação
    for (let contact of contacts) {
        if (!contact.ended && now - contact.lastMessageTime > TIMEOUT) {
            // Se passou mais de 5 minutos sem interações, encerrar o atendimento
            contact.ended = true;
            await saveContacts(contacts);

            // Enviar mensagem de encerramento ao usuário
            await client.sendMessage(contact.number, `Seu atendimento foi encerrado automaticamente devido à inatividade de 5 minutos. Caso precise de ajuda novamente, basta iniciar um novo atendimento digitando: *9*`);
        }
    }
};

// Verificar os tempos de inatividade a cada minuto
setInterval(checkTimeouts, 60 * 1000); // Verificar a cada 1 minuto


// Função que será chamada sempre que uma mensagem for recebida
client.on('message', async (message) => {
    const contacts = await loadContacts();

    // Verificar se o número já está na lista de contatos
    const contactExists = contacts.some(contact => contact.number === message.from);
    let user;

    if(message.body === "9"){
        user = contacts.find(contact => contact.number === message.from);
        if(user.ended) {
            // Reabrir o atendimento (marcar como não encerrado)
            user.ended = false;
            user.lastMessageTime = Date.now();  // Reiniciar o tempo
            await saveContacts(contacts);

            // Enviar mensagem de volta ao atendimento
            await client.sendMessage(message.from, 
`Seja bem-vindo de volta ao atendimento.
Para relembrar segue as opções de atendimento abaixo:

 1- Preciso falar com atendente.
 2- Preciso de auxilio com Sped fiscal.
 3- Estou com dificuldades de acessar o sistema.
 4- Sair do atendimento!`);
        }
    }

    // Se o número não está na lista, adicionar o usuário e iniciar o atendimento
    if (!contactExists) {
        // Adicionar o usuário à lista de contatos com um timestamp inicial
        contacts.push({ number: message.from, lastMessageTime: Date.now(), ended: false });
        await saveContacts(contacts);

        // Enviar mensagem de boas-vindas
        await client.sendMessage(message.from, 
`Olá! 👋
Esperamos que esteja bem! 😊
Gostaríamos de informar que o *chat do WhatsApp* será utilizado exclusivamente para retorno. 📱

Para facilitar o atendimento, caso precise de algo ou tenha alguma dúvida, por favor selecione uma das opções abaixo:

 1- Preciso falar com atendente.
 2- Preciso de auxilio com Sped fiscal.
 3- Estou com dificuldades de acessar o sistema.
 4- Sair do atendimento
`);
    } else if(contactExists) {
        // Encontrar o usuário
        user = contacts.find(contact => contact.number === message.from);

        // Verificar se o atendimento foi encerrado
        if (user.ended) {
            return; // Se o usuário foi marcado como "ended", não envie mais mensagens
        }

        // Atualizar o timestamp da última mensagem recebida
        user.lastMessageTime = Date.now();
        await saveContacts(contacts);

        // Processar as mensagens normalmente
        switch (message.body) {
            case "1":
                await client.sendMessage(message.from, 
`Entendemos que você possa estar precisando de ajuda de um dos nossos analistas e estamos aqui para garantir que você receba o suporte adequado.

Caso precise de assistência especializada ou tenha alguma dúvida que precise de atenção, não hesite em entrar em contato com nossa equipe de suporte.

Estamos disponíveis através dos seguintes canais:

💬 *Via Chat*: openmanager.com.br/app

📞 *Via Ramal*: 2180-0150

Lembre-se, se estiver enfrentando dificuldades para acessar o sistema, basta digitar *3* e um analista estará pronto para auxiliá-lo com a questão de *acesso*.
Para voltar ao menu inicial digite *0*`);
                break;

            case "2":
                await client.sendMessage(message.from, 
`Você selecionou a opção de auxílio com o Sped Fiscal. 
Para que possamos realizar uma análise mais precisa, por favor, encaminhe o arquivo com as informações divergentes para o seguinte e-mail:

📧 *Email*: suporte@openmanager.com.br

Assim, nossos analistas poderão revisar os dados e fornecer o suporte necessário de forma eficiente.
Para voltar ao menu inicial digite *0*.`);
                break;

            case "3":
                await client.sendMessage(message.from, 
`Olá! 😄

Estamos trabalhando para analisar sua solicitação e verificar qualquer instabilidade que possa estar ocorrendo. 
Fique tranquilo, um de nossos analistas especializados irá retornar em breve para fornecer a assistência necessária. 
Agradecemos muito pela sua compreensão e paciência enquanto resolvemos essa questão.
Entendemos que sua situação pode ser urgente, e por isso, se precisar de uma resposta mais rápida ou se tiver dúvidas adicionais, não hesite em entrar em contato conosco pelos seguintes canais:

👉 *Chat*: openmanager.com.br/app 
📞 *Ramal*: 2180-0150

Se possível, tente utilizar esses canais para um atendimento mais ágil. 😊

Estamos à disposição para ajudar! 💬
Para voltar ao atendimento digite *9*.`);

                // Marcar o atendimento como encerrado
                user.ended = true;
                await saveContacts(contacts);

                break;

            case "4":
                // Se o usuário deseja sair do atendimento
                await client.sendMessage(message.from, 
`Você escolheu encerrar o atendimento. 
Seu atendimento foi encerrado e você não receberá mais mensagens automáticas.
Para voltar ao atendimento digite: *9*.

Agradecemos o contato, bom trabalho, até logo!!`);

                // Marcar o atendimento como encerrado
                user.ended = true;
                await saveContacts(contacts);
                break;

            case "0":
                await client.sendMessage(message.from, 
`Olá! 👋
Esperamos que esteja bem! 😊
Gostaríamos de informar que o *chat do WhatsApp* será utilizado exclusivamente para retorno. 📱

Para facilitar o atendimento, caso precise de algo ou tenha alguma dúvida, por favor selecione uma das opções abaixo:

 1- Preciso falar com atendente.
 2- Preciso de auxilio com Sped fiscal.
 3- Estou com dificuldades de acessar o sistema.
 4- Sair do atendimento
`);

                // Marcar o atendimento como encerrado
                // user.ended = true;
                // saveContacts(contacts);
                break;

            case "9":
                // Verificar se o usuário está no atendimento e não encerrou
                if (!user.ended) {
                    await client.sendMessage(message.from, 
`Você já está em atendimento, agradecemos o contato. 😊`);
                }
                break;

            default:
                await client.sendMessage(message.from, 
`Desculpe, não conseguimos acessar essa opção. Por favor, escolha uma das opções válidas:

 1- Preciso falar com atendente.
 2- Preciso de auxilio com Sped fiscal.
 3- Estou com dificuldades de acessar o sistema.
 4- Sair do atendimento
`);
                break;
        }
    }
});

// Inicializar o cliente
client.initialize();
