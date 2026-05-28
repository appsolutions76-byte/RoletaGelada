
        const SUPABASE_URL = 'https://vjupsdakdxexxcdkqfzf.supabase.co';
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqdXBzZGFrZHhleHhjZGtxZnpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjY2NDYsImV4cCI6MjA5NTI0MjY0Nn0.5XKPuhn34s-EUf6NXqNwpZysQoJVsyBIHQeVg4wnyyo';
        
        let supabase = null;

        try {
            if (window.supabase) {
                supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                
                // -- Autenticação --
                supabase.auth.onAuthStateChange((event, session) => {
                    if (session) {
                        window.BAR_ID = session.user.id;
                        document.getElementById('auth-screen').classList.add('hidden');
                        document.getElementById('dashboard-screen').classList.remove('hidden');
                        loadDashboard();
                    } else {
                        document.getElementById('auth-screen').classList.remove('hidden');
                        document.getElementById('dashboard-screen').classList.add('hidden');
                    }
                });
            }
        } catch(e) { console.error("Supabase block erro:", e); }

        async function handleLogin() {
            if (!supabase) return alert("Erro crítico de conexão: O banco de dados não carregou. Desative adblockers e atualize a página.");
            try {
                const e = document.getElementById('auth-email').value;
                const p = document.getElementById('auth-password').value;
                const { error } = await supabase.auth.signInWithPassword({ email: e, password: p });
                if (error) showError(error.message);
            } catch(e) {
                alert("ERRO GRAVE: " + e.message);
            }
        }

        async function handleSignUp() {
            if (!supabase) return alert("Erro crítico de conexão: O banco de dados não carregou. Desative adblockers e atualize a página.");
            try {
                const n = document.getElementById('auth-bar-name').value;
                const e = document.getElementById('auth-email').value;
                const p = document.getElementById('auth-password').value;
                
                if(!n) return showError("Preencha o Nome do Bar para cadastrar.");

                const { error } = await supabase.auth.signUp({ 
                    email: e, 
                    password: p,
                    options: { data: { bar_name: n } }
                });
                
                if (error) {
                    if (error.message.includes('already registered')) {
                        alert("Atenção: Este e-mail JÁ POSSUI CONTA!\n\nVocê já criou essa conta anteriormente. Por favor, digite sua senha e clique no botão azul 'Entrar' (em vez de 'Criar Conta').\n\nSe tiver esquecido a senha, recrie a conta com outro e-mail.");
                        showError("Este e-mail já existe. Clique em Entrar.");
                    } else {
                        showError("ERRO: " + error.message);
                    }
                } else {
                    alert("Conta do Bar criada com sucesso!\n\nSe o seu Supabase estiver exigindo confirmação de e-mail, você precisará clicar no link enviado para " + e + " antes de conseguir fazer login.\n\nPara facilitar, vá no painel do Supabase -> Authentication -> Providers -> Email e desative a opção 'Confirm email'.");
                }
            } catch(e) {
                alert("ERRO GRAVE: " + e.message);
            }
        }

        async function logout() { await supabase.auth.signOut(); }

        function showError(msg) {
            const el = document.getElementById('auth-error');
            el.innerText = msg; el.classList.remove('hidden');
            setTimeout(() => el.classList.add('hidden'), 5000);
        }

        // -- Dashboard --
        async function loadDashboard() {
            try {
                const { data: bar, error: barError } = await supabase.from('bars').select('*').eq('id', window.BAR_ID).single();
                if(barError) throw new Error("Falha ao ler tabela bars: " + barError.message);
                if(!bar) return;

            document.getElementById('nav-bar-name').innerText = bar.name;
            
            // Tenta carregar os minor prizes e consolation fee (se as colunas existirem)
            if (bar.minor_prizes !== undefined && bar.minor_prizes !== null) {
                document.getElementById('minor-prizes-input').value = bar.minor_prizes;
            }
            if (bar.consolation_fee !== undefined && bar.consolation_fee !== null) {
                document.getElementById('consolation-fee-input').value = bar.consolation_fee;
            }
            
            // Carrega as configurações de tema
            if (bar.theme_color) document.getElementById('theme-color-input').value = bar.theme_color;
            if (bar.theme_background) document.getElementById('theme-bg-input').value = bar.theme_background;
            if (bar.theme_logo_url) document.getElementById('theme-logo-input').value = bar.theme_logo_url;

            if (bar.mp_access_token) {
                document.getElementById('mp-status').innerHTML = "✅ Conectado ao Mercado Pago";
                document.getElementById('mp-status').className = "mb-4 font-semibold text-green-600";
                document.getElementById('mp-token-input').value = bar.mp_access_token;
            }

            const { data: prizes } = await supabase.from('prizes').select('*').eq('bar_id', window.BAR_ID);
            const tbody = document.getElementById('table-prizes');
            tbody.innerHTML = '';
            prizes.forEach(p => {
                const safeName = p.name.replace(/'/g, "\\'").replace(/"/g, "&quot;");
                tbody.innerHTML += `
                    <tr class="border-b border-gray-700/50 hover:bg-white/5 transition">
                        <td class="p-3 font-semibold text-white">${p.name}</td>
                        <td class="p-3 text-cyan-400 font-bold">R$ ${p.bet_amount}</td>
                        <td class="p-3 text-gray-400">R$ ${p.prize_cost}</td>
                        <td class="p-3 text-right">
                            <button onclick="openEditModal('${p.id}', '${safeName}', ${p.prize_cost}, ${p.bet_amount})" class="text-blue-400 hover:text-blue-300 text-xs uppercase font-bold underline transition mr-2">Editar</button>
                            <button onclick="deletePrize('${p.id}')" class="text-red-400 hover:text-red-300 text-xs uppercase font-bold underline transition">Excluir</button>
                        </td>
                    </tr>
                `;
            });

            // Pega as configurações da plataforma para calcular o líquido
            const { data: settings } = await supabase.from('platform_settings').select('markup_multiplier, platform_fee_percentage').limit(1).single();
            if (settings) {
                window.MARKUP = settings.markup_multiplier;
                window.FEE = settings.platform_fee_percentage;
            } else {
                window.FEE = 0.05;
            }

            // Carrega faturamento real
            const { data: rounds, error: roundsError } = await supabase.from('rounds').select('bet_amount, status').eq('bar_id', window.BAR_ID);
            if (roundsError) {
                alert("⚠️ AVISO: Erro ao carregar as rodadas. Você executou a migration 04 no banco de dados? Erro: " + roundsError.message);
                throw new Error("Erro na tabela rounds: " + roundsError.message);
            }

            const paid = rounds ? rounds.filter(r => ['paid','spinning','completed'].includes(r.status)) : [];
            const rev = paid.reduce((acc, curr) => acc + Number(curr.bet_amount), 0);
            const totalSpins = paid.length;
            const revEl = document.getElementById('kpi-bar-rev');
            if(revEl) revEl.innerText = `R$ ${rev.toFixed(2)}`;

            const consolationFee = parseFloat(bar.consolation_fee) || 0;
            const totalConsolation = totalSpins * consolationFee;
            const platformFeeTotal = rev * window.FEE;
            const netRev = rev - platformFeeTotal - totalConsolation;

            document.getElementById('kpi-bar-net').innerText = `R$ ${netRev.toFixed(2)}`;
            const consEl = document.getElementById('kpi-bar-consolation');
            if(consEl) consEl.innerText = `R$ ${totalConsolation.toFixed(2)}`;
            document.getElementById('kpi-bar-spins').innerText = totalSpins;

            // Realtime Sync para produção
            if (!window.realtimeSubscribed) {
                window.realtimeSubscribed = true;
                supabase.channel('admin-rounds').on('postgres_changes', { event: '*', schema: 'public', table: 'rounds', filter: `bar_id=eq.${window.BAR_ID}` }, () => {
                    loadDashboard();
                }).subscribe();
            }
            } catch (err) {
                console.error("Erro Crítico no loadDashboard:", err);
            }
        }

        async function saveMinorPrizes() {
            if (window.isSimulationMode) return; // tratado acima
            const val = document.getElementById('minor-prizes-input').value;
            const fee = parseFloat(document.getElementById('consolation-fee-input').value) || 0;
            const { error } = await supabase.from('bars').update({ minor_prizes: val, consolation_fee: fee }).eq('id', window.BAR_ID);
            const msg = document.getElementById('minor-prizes-msg');
            if (error) {
                msg.innerText = "Atenção: Para o modo real funcionar, crie a coluna 'minor_prizes' tipo Text na tabela bars no Supabase!";
                msg.className = "text-yellow-400 text-sm mt-2 font-bold";
            } else {
                msg.innerText = "Salvo com sucesso!";
                msg.className = "text-green-400 text-sm mt-2 font-bold";
            }
            msg.classList.remove('hidden');
            setTimeout(() => msg.classList.add('hidden'), 5000);
        }

        async function saveThemeSettings() {
            const tColor = document.getElementById('theme-color-input').value;
            const tBg = document.getElementById('theme-bg-input').value;
            const tLogo = document.getElementById('theme-logo-input').value;
            
            const { error } = await supabase.from('bars').update({ theme_color: tColor, theme_background: tBg, theme_logo_url: tLogo }).eq('id', window.BAR_ID);
            const msg = document.getElementById('theme-msg');
            if (error) {
                msg.innerText = "Atenção: Rode a migration 03 para criar as colunas de tema no Supabase!";
                msg.className = "text-yellow-400 text-sm mt-2 font-bold";
            } else {
                msg.innerText = "Tema salvo com sucesso!";
                msg.className = "text-green-400 text-sm mt-2 font-bold";
            }
            msg.classList.remove('hidden');
            setTimeout(() => msg.classList.add('hidden'), 5000);
        }

        async function saveMPToken() {
            const token = document.getElementById('mp-token-input').value;
            if (!token) return alert('Digite um token válido!');
            
            const { error } = await supabase.from('bars').update({ mp_access_token: token }).eq('id', window.BAR_ID);
            const msg = document.getElementById('mp-token-msg');
            if (error) {
                msg.innerText = "Erro ao salvar token!";
                msg.className = "text-red-400 text-sm mt-2 font-bold";
            } else {
                msg.innerText = "Token salvo com sucesso!";
                msg.className = "text-green-400 text-sm mt-2 font-bold";
                document.getElementById('mp-status').innerHTML = "✅ Conectado ao Mercado Pago";
                document.getElementById('mp-status').className = "mb-4 font-semibold text-green-600";
            }
            msg.classList.remove('hidden');
            setTimeout(() => msg.classList.add('hidden'), 5000);
        }

        async function savePrize() {
            const name = document.getElementById('prize-name').value;
            const cost = document.getElementById('prize-cost').value;
            const bet = document.getElementById('prize-bet').value;
            
            if(!name) return alert("Digite um nome!");

            const { error } = await supabase.from('prizes').insert([{ bar_id: window.BAR_ID, name, prize_cost: cost, bet_amount: bet }]);
            if(error) return alert("Erro ao salvar prêmio: " + error.message);

            document.getElementById('modal-prize').classList.add('hidden');
            loadDashboard();
        }

        function openEditModal(id, name, cost, bet) {
            document.getElementById('edit-prize-id').value = id;
            document.getElementById('edit-prize-name').value = name;
            document.getElementById('edit-prize-cost').value = cost;
            document.getElementById('edit-prize-bet').value = bet;
            document.getElementById('modal-edit-prize').classList.remove('hidden');
        }

        async function updatePrize() {
            if (window.isSimulationMode) return window.updatePrize(); // Chama a versão da simulação
            
            const id = document.getElementById('edit-prize-id').value;
            const name = document.getElementById('edit-prize-name').value;
            const cost = document.getElementById('edit-prize-cost').value;
            const bet = document.getElementById('edit-prize-bet').value;
            
            if(!name) return alert("Digite um nome!");

            const { error } = await supabase.from('prizes').update({ name, prize_cost: cost, bet_amount: bet }).eq('id', id);
            if(error) return alert("Erro ao atualizar prêmio: " + error.message);

            document.getElementById('modal-edit-prize').classList.add('hidden');
            loadDashboard();
        }

        async function deletePrize(id) {
            if(confirm("Deseja realmente excluir este prêmio?")) {
                await supabase.from('prizes').delete().eq('id', id);
                loadDashboard();
            }
        }

        function showQR() {
            alert("Apresente o QR gerado abaixo.");
        }
    