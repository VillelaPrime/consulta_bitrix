document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('cnpj-form');
    const loading = document.getElementById('loading');
    const kanbanBoard = document.getElementById('kanban-board');
    const statusDisplay = document.getElementById('status-display');
    const container = document.querySelector('.container');

    // Etapas liberadas dos funis
    const operationalStagesLiberated = [
        "Pre Renuncia", "Aguardando Renúncia/Distrato", "Ex PJ", "Ex Sem interesse", 
        "Ex Pre Renuncia", "Ex PJ/PAP", "Ex Distratado"
    ];

    const financialStagesLiberated = [
        "Pre-Renuncia", "Distratado", "Renuncia", 
        "COPIA RENUNCIA VILLELATECH", "Ex Projuris Bancário", "Ex Projuris Trabalhista", 
        "Ex Score", "Ex P.A.P"
    ];

    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        const input = document.getElementById('cnpj');
        const rawValue = input.value.trim().replace(/\D/g, ''); // Remove todos os caracteres não numéricos

        if (!rawValue) {
            showError('Por favor, insira um CPF ou CNPJ válido.');
            return;
        }

        if (rawValue.length === 11) {
            input.value = formatCPF(rawValue);
        } else if (rawValue.length === 14) {
            input.value = formatCNPJ(rawValue);
        } else {
            showError('O número informado não é um CPF ou CNPJ válido.');
            return;
        }
        const cnpj = input.value.trim();
        loading.style.display = 'block';
        kanbanBoard.style.display = 'none';
        statusDisplay.innerHTML = '';
        container.classList.remove('theme-green', 'theme-red');

        try {
            const apiBase = 'https://villela.bitrix24.com.br/rest/16640/0jcbup8p75s3drmo';
            const dealListUrl = `${apiBase}/crm.deal.list.json`;
            const contactGetUrl = `${apiBase}/crm.contact.get`;
            const categoryListUrl = `${apiBase}/crm.dealcategory.list.json`;
            const statusListUrl = `${apiBase}/crm.status.list.json`;

            // Obter Categorias
            const categoryResponse = await fetch(categoryListUrl);
            const categoryData = await categoryResponse.json();
            const categories = categoryData.result || [];

            // Obter Etapas
            const statusResponse = await fetch(statusListUrl);
            const statusData = await statusResponse.json();
            const stages = statusData.result || [];

            // Mapear IDs para Nomes
            const categoryMap = categories.reduce((map, category) => {
                map[category.ID] = category.NAME;
                return map;
            }, {});

            const stageMap = stages.reduce((map, stage) => {
                if (stage.ENTITY_ID.startsWith('DEAL_STAGE')) {
                    map[stage.STATUS_ID] = stage.NAME;
                }
                return map;
            }, {});

            // Obter Negócios
            const dealResponse = await fetch(dealListUrl + `?FILTER[UF_CRM_5C474435A75C9]=${cnpj}&SELECT[]=TITLE&SELECT[]=CATEGORY_ID&SELECT[]=STAGE_ID&SELECT[]=CONTACT_ID`);
            const dealsData = await dealResponse.json();
            const deals = dealsData.result || [];

            // Obter contatos únicos
            const contactIds = [...new Set(deals.map(deal => deal.CONTACT_ID).filter(id => id))];
            const contacts = {};

            for (const id of contactIds) {
                const contactResponse = await fetch(contactGetUrl + `?ID=${id}`);
                const contactData = await contactResponse.json();
                if (contactData.result) {
                    const contact = contactData.result;
                    const name = contact.NAME || 'Sem Nome';
                    const phone = contact.PHONE && contact.PHONE[0] ? contact.PHONE[0].VALUE : 'Sem Telefone';
                    
                    // Verificação de duplicatas pelo telefone
                    if (phone && !contacts[phone]) {
                        contacts[phone] = { name, phone };
                    }
                }
            }

            kanbanBoard.innerHTML = '';

            let canProceed = true;
            
            const operationalAndFinancial = deals.filter(deal => 
                categoryMap[deal.CATEGORY_ID]?.toLowerCase() === 'operacional' || categoryMap[deal.CATEGORY_ID]?.toLowerCase() === 'plano de saude financeira'
            );

            const otherFunnels = deals.filter(deal => 
                categoryMap[deal.CATEGORY_ID]?.toLowerCase() !== 'operacional' && categoryMap[deal.CATEGORY_ID]?.toLowerCase() !== 'plano de saude financeira'
            );

            if (deals.length === 0) {
                // Caso nenhum negócio seja encontrado
                container.classList.add('theme-green');
                statusDisplay.innerHTML = `<div class="status-card status-liberado"><h2>PROSSEGUIR</h2><p>Não existe nenhum negócio associado a este CNPJ. Você pode prosseguir com o atendimento.</p></div>`;
            } else {
                const groupedResults = operationalAndFinancial.reduce((acc, deal) => {
                    const funilName = categoryMap[deal.CATEGORY_ID] || 'Funil Desconhecido';
                    if (!acc[funilName]) {
                        acc[funilName] = [];
                    }
                    acc[funilName].push(deal);
                    return acc;
                }, {});

                Object.keys(groupedResults).forEach(funil => {
                    const column = document.createElement('div');
                    column.className = 'kanban-column';

                    const columnHeader = document.createElement('h2');
                    columnHeader.textContent = funil;
                    column.appendChild(columnHeader);

                    groupedResults[funil].forEach(deal => {
                        let status = 'Liberado';
                        let statusClass = 'status-liberado';
                        let categoriaAtual = categoryMap[deal.CATEGORY_ID] ? categoryMap[deal.CATEGORY_ID]: 'Funil Desconhecido'

                        if (categoriaAtual.toLowerCase() === 'operacional') {
                            if (!operationalStagesLiberated.includes(stageMap[deal.STAGE_ID])) {
                                status = 'Não Liberado';
                                statusClass = 'status-nao-liberado';
                                canProceed = false;
                            }
                        } else if (categoriaAtual.toLowerCase() === 'plano de saude financeira') {
                            if (!financialStagesLiberated.includes(stageMap[deal.STAGE_ID])) {
                                status = 'Não Liberado';
                                statusClass = 'status-nao-liberado';
                                canProceed = false;
                            }
                        }

                        const kanbanItem = document.createElement('div');
                        kanbanItem.className = `kanban-item ${statusClass}`;
                        kanbanItem.innerHTML = `
                            <p><strong>Nome da Empresa:</strong> ${deal.TITLE}</p>
                            <p><strong>CNPJ:</strong> ${cnpj}</p>
                            <p><strong>Etapa:</strong> ${stageMap[deal.STAGE_ID] || 'Etapa Desconhecida'}</p>
                            <p><strong>Funil:</strong> ${funil}</p>
                            <div class="contact-list">
                                <p><strong>Contatos:</strong></p>
                                ${deal.CONTACT_ID ? Object.values(contacts).map(contact => `
                                    <div class="contact-item">
                                        <span class="contact-name">${contact.name}</span>
                                        <span class="contact-phone">${contact.phone}</span>
                                    </div>
                                `).join('') : '<p>Sem contatos associados.</p>'}
                            </div>
                        `;
                        column.appendChild(kanbanItem);
                    });

                    kanbanBoard.appendChild(column);
                });

                if (canProceed) {
                    container.classList.add('theme-green');
                    statusDisplay.innerHTML = `<div class="status-card status-liberado"><h2>PROSSEGUIR</h2></div>`;
                } else {
                    container.classList.add('theme-red');
                    statusDisplay.innerHTML = `<div class="status-card status-nao-liberado"><h2>NÃO PROSSEGUIR</h2></div>`;
                }

                if (otherFunnels.length > 0) {
                    const showOthersButton = document.createElement('button');
                    showOthersButton.textContent = 'Exibir outros funis';
                    showOthersButton.className = 'show-others-button';
                    showOthersButton.addEventListener('click', () => {
                        const groupedOthers = otherFunnels.reduce((acc, deal) => {
                            const funilName = categoryMap[deal.CATEGORY_ID] || 'Funil Desconhecido';
                            if (!acc[funilName]) {
                                acc[funilName] = [];
                            }
                            acc[funilName].push(deal);
                            return acc;
                        }, {});

                        Object.keys(groupedOthers).forEach(funil => {
                            const column = document.createElement('div');
                            column.className = 'kanban-column';

                            const columnHeader = document.createElement('h2');
                            columnHeader.textContent = funil;
                            column.appendChild(columnHeader);

                            groupedOthers[funil].forEach(deal => {
                                const kanbanItem = document.createElement('div');
                                kanbanItem.className = 'kanban-item';
                                kanbanItem.innerHTML = `
                                    <p><strong>Nome da Empresa:</strong> ${deal.TITLE}</p>
                                    <p><strong>CNPJ:</strong> ${cnpj}</p>
                                    <p><strong>Etapa:</strong> ${stageMap[deal.STAGE_ID] || 'Etapa Desconhecida'}</p>
                                    <p><strong>Funil:</strong> ${funil}</p>
                                `;
                                column.appendChild(kanbanItem);
                            });

                            kanbanBoard.appendChild(column);
                        });

                        showOthersButton.style.display = 'none';
                    });

                    kanbanBoard.appendChild(showOthersButton);
                }
            }

            kanbanBoard.style.display = 'flex';

        } catch (error) {
            alert('Erro ao carregar dados: ' + error.message);
        } finally {
            loading.style.display = 'none';
        }
    });
});
function formatCPF(value) {
    return value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatCNPJ(value) {
    return value.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

function showError(message) {
    const statusDisplay = document.getElementById('status-display')
    statusDisplay.innerHTML = `<div class="status-card status-nao-liberado">${message}</div>`;
    container.classList.add('theme-red');
}