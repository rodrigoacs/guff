document.addEventListener('DOMContentLoaded', () => {
  let colecoes = []
  let colecaoAtual = null // slug da coleção selecionada
  let cartasOriginais = []
  let cartasExibidas = []
  let filtroAtual = 'todas'
  let carregando = false

  let paginaAtual = 1
  const CARTAS_POR_PAGINA = 36
  const CHAVE_ULTIMA_COLECAO = 'guff:ultima-colecao'
  const CORES_PADRAO = ['#8C93F2', '#6FCF97', '#F2C879', '#F2777A', '#79D6F2']

  const gridCartas = document.getElementById('grid-cartas')
  const inputBusca = document.getElementById('busca')
  const containerFiltros = document.getElementById('container-filtros')
  const btnExportarLiga = document.getElementById('btn-exportar-ligamagic')
  const switcher = document.getElementById('switcher')
  const tituloColecao = document.getElementById('titulo-colecao')

  const heroPercent = document.getElementById('hero-percent')
  const elTotal = document.getElementById('total-cartas')
  const elColetadas = document.getElementById('cartas-coletadas')
  const elFaltantes = document.getElementById('cartas-faltantes')
  const elProgressBar = document.getElementById('progress-bar')

  const btnAnterior = document.getElementById('btn-anterior')
  const btnProxima = document.getElementById('btn-proxima')
  const btnAnteriorBottom = document.getElementById('btn-anterior-bottom')
  const btnProximaBottom = document.getElementById('btn-proxima-bottom')
  const infoPagina = document.getElementById('info-pagina')
  const infoPaginaBottom = document.getElementById('info-pagina-bottom')

  const modal = document.getElementById('modal-carta')
  const imgModal = document.getElementById('img-modal')
  const legendaModal = document.getElementById('legenda-modal')
  const spanFecharModal = document.querySelector('.modal-fechar')
  const backdropModal = document.querySelector('.modal-backdrop')

  let ultimaCartaAtualizadaId = null

  // Pausa a animação do foil/etched quando a aba não está visível (economiza CPU/GPU em segundo plano)
  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('animacoes-pausadas', document.hidden)
  })

  const mostrarErro = (mensagem) => {
    if (gridCartas) {
      gridCartas.innerHTML = `<p style="color: var(--danger-color); text-align: center; width: 100%; grid-column: 1/-1;">${mensagem}</p>`
    }
  }

  const mostrarSkeleton = () => {
    if (!gridCartas) return
    gridCartas.innerHTML = ''
    for (let i = 0; i < CARTAS_POR_PAGINA; i++) {
      const slot = document.createElement('div')
      slot.className = 'slot-carta slot-skeleton'
      gridCartas.appendChild(slot)
    }
  }

  const corDaColecao = (colecao, index) => colecao.cor || CORES_PADRAO[index % CORES_PADRAO.length]

  // --- Carregamento da lista de coleções e do switcher ---

  const carregarColecoes = async () => {
    try {
      const resposta = await fetch('/api/colecoes')
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`)
      colecoes = await resposta.json()

      if (!Array.isArray(colecoes) || colecoes.length === 0) {
        mostrarErro('Nenhuma coleção cadastrada em data/colecoes.json.')
        return
      }

      renderizarSwitcher()

      const ultimaSalva = localStorage.getItem(CHAVE_ULTIMA_COLECAO)
      const slugInicial = colecoes.some(c => c.slug === ultimaSalva) ? ultimaSalva : colecoes[0].slug

      selecionarColecao(slugInicial)
    } catch (error) {
      console.error('Erro ao carregar coleções:', error)
      mostrarErro('Não foi possível carregar a lista de coleções. Verifique o servidor.')
    }
  }

  const renderizarSwitcher = () => {
    if (!switcher) return
    switcher.innerHTML = ''

    colecoes.forEach((colecao, index) => {
      const cor = corDaColecao(colecao, index)
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'pill-colecao' + (colecao.slug === colecaoAtual ? ' ativa' : '')
      btn.style.setProperty('--pill-cor', cor)
      btn.setAttribute('aria-pressed', colecao.slug === colecaoAtual ? 'true' : 'false')

      const progresso = colecao.erro ? 'erro' : `${colecao.coletadas ?? 0}/${colecao.total ?? 0}`
      btn.innerHTML = `
        <span class="ponto"></span>
        ${colecao.nome}
        <span class="pill-progresso">${progresso}</span>
      `

      btn.addEventListener('click', () => selecionarColecao(colecao.slug))
      switcher.appendChild(btn)
    })
  }

  const selecionarColecao = (slug) => {
    colecaoAtual = slug
    localStorage.setItem(CHAVE_ULTIMA_COLECAO, slug)

    const index = colecoes.findIndex(c => c.slug === slug)
    const colecao = index !== -1 ? colecoes[index] : null
    if (tituloColecao) tituloColecao.textContent = colecao ? colecao.nome : 'Guff'

    renderizarSwitcher()

    filtroAtual = 'todas'
    paginaAtual = 1
    if (inputBusca) inputBusca.value = ''
    document.querySelectorAll('#container-filtros .filter-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-filter') === 'todas')
    })

    carregarCartas()
  }

  // --- Cartas da coleção selecionada ---

  const carregarCartas = async () => {
    if (!colecaoAtual) return

    carregando = true
    mostrarSkeleton()

    try {
      const resposta = await fetch(`/api/colecoes/${colecaoAtual}/cartas`)
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => ({}))
        throw new Error(corpo.error || `HTTP ${resposta.status}`)
      }
      cartasOriginais = await resposta.json()
      gerarBotoesDeEdicao()
      carregando = false
      aplicarFiltrosEBusca()
    } catch (error) {
      carregando = false
      console.error('Erro ao carregar cartas:', error)
      mostrarErro('Erro de conexão ao carregar as cartas desta coleção. Verifique o servidor.')
    }
  }

  const gerarBotoesDeEdicao = () => {
    if (!containerFiltros || !btnExportarLiga) return

    const edicoesUnicas = [...new Set(cartasOriginais.map(c => c.edicao).filter(Boolean))]

    document.querySelectorAll('#container-filtros .btn-dinamico').forEach(b => b.remove())

    edicoesUnicas.forEach(edicao => {
      const btn = document.createElement('button')
      btn.className = 'filter-btn btn-dinamico'
      btn.setAttribute('data-filter', `edicao-${edicao}`)
      btn.textContent = `Apenas ${edicao}`

      containerFiltros.insertBefore(btn, btnExportarLiga)
    })
  }

  window.atualizarQtd = async (id, delta) => {
    if (!colecaoAtual) return
    try {
      const resposta = await fetch(`/api/colecoes/${colecaoAtual}/cartas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta })
      })

      if (resposta.ok) {
        const cartaAtualizada = await resposta.json()
        const index = cartasOriginais.findIndex(c => c.id === id)
        if (index !== -1) {
          cartasOriginais[index] = cartaAtualizada
        }
        ultimaCartaAtualizadaId = id
        aplicarFiltrosEBusca()
      } else {
        const corpo = await resposta.json().catch(() => ({}))
        console.error('Erro ao atualizar quantidade:', corpo.error || resposta.status)
      }
    } catch (error) {
      console.error('Erro ao atualizar quantidade:', error)
    }
  }

  window.alternarTratamento = async (id, tratamentoAtual) => {
    if (!colecaoAtual) return
    const tratamentos = ['normal', 'foil', 'etched']
    let proximoIndex = (tratamentos.indexOf(tratamentoAtual || 'normal') + 1) % tratamentos.length
    const novoTratamento = tratamentos[proximoIndex]

    try {
      const resposta = await fetch(`/api/colecoes/${colecaoAtual}/cartas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tratamento: novoTratamento })
      })

      if (resposta.ok) {
        const cartaAtualizada = await resposta.json()
        const index = cartasOriginais.findIndex(c => c.id === id)
        if (index !== -1) {
          cartasOriginais[index] = cartaAtualizada
        }
        aplicarFiltrosEBusca()
      } else {
        const corpo = await resposta.json().catch(() => ({}))
        console.error('Erro ao atualizar tratamento:', corpo.error || resposta.status)
      }
    } catch (error) {
      console.error('Erro ao atualizar tratamento:', error)
    }
  }

  // --- Modal (com trava de foco simples para acessibilidade) ---

  let elementoComFocoAntesDoModal = null

  const getFocaveisDoModal = () => {
    const wrapper = modal.querySelector('.modal-wrapper')
    if (!wrapper) return []
    return Array.from(wrapper.querySelectorAll('button, [href], img, [tabindex]:not([tabindex="-1"])'))
      .filter(el => !el.disabled)
  }

  const trancarFocoNoModal = (e) => {
    if (e.key !== 'Tab') return
    const focaveis = getFocaveisDoModal()
    if (focaveis.length === 0) return

    const primeiro = focaveis[0]
    const ultimo = focaveis[focaveis.length - 1]

    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault()
      ultimo.focus()
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault()
      primeiro.focus()
    }
  }

  window.abrirModal = (urlSrc, nomeCarta, edicaoCarta) => {
    if (!modal || !imgModal || !legendaModal) return
    elementoComFocoAntesDoModal = document.activeElement

    imgModal.src = urlSrc
    imgModal.alt = `${nomeCarta} (${edicaoCarta})`
    legendaModal.textContent = `${nomeCarta} (${edicaoCarta})`
    modal.classList.add('mostrar')

    document.addEventListener('keydown', trancarFocoNoModal)
    if (spanFecharModal) spanFecharModal.focus()
  }

  const fecharModal = () => {
    if (!modal || !imgModal || !legendaModal) return
    modal.classList.remove('mostrar')
    document.removeEventListener('keydown', trancarFocoNoModal)

    setTimeout(() => {
      imgModal.src = ''
      imgModal.alt = ''
      legendaModal.textContent = ''
    }, 300)

    if (elementoComFocoAntesDoModal && typeof elementoComFocoAntesDoModal.focus === 'function') {
      elementoComFocoAntesDoModal.focus()
    }
    elementoComFocoAntesDoModal = null
  }

  if (spanFecharModal) spanFecharModal.onclick = fecharModal
  if (backdropModal) backdropModal.onclick = fecharModal

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.classList.contains('mostrar')) {
      fecharModal()
    }
  })

  const atualizarDashboard = () => {
    const total = cartasOriginais.length
    const coletadas = cartasOriginais.filter(c => c.quantidade > 0).length
    const faltantes = total - coletadas
    const porcentagem = total === 0 ? 0 : Math.round((coletadas / total) * 100)

    if (heroPercent) heroPercent.textContent = `${porcentagem}%`
    if (elTotal) elTotal.textContent = total
    if (elColetadas) elColetadas.textContent = coletadas
    if (elFaltantes) elFaltantes.textContent = faltantes
    if (elProgressBar) {
      elProgressBar.style.width = `${porcentagem}%`
      elProgressBar.style.background = porcentagem >= 100 ? 'var(--success-color)' : 'var(--accent-color)'
    }

    const colecaoIndex = colecoes.findIndex(c => c.slug === colecaoAtual)
    if (colecaoIndex !== -1) {
      colecoes[colecaoIndex].total = total
      colecoes[colecaoIndex].coletadas = coletadas
      renderizarSwitcher()
    }
  }

  const renderizarGrid = () => {
    if (!gridCartas) return
    gridCartas.innerHTML = ''

    if (cartasExibidas.length === 0) {
      const estadoVazio = document.createElement('div')
      estadoVazio.className = 'estado-vazio'
      estadoVazio.innerHTML = `
        <strong>Nenhuma carta encontrada</strong>
        <span>Tente ajustar a busca ou trocar o filtro.</span>
      `
      gridCartas.appendChild(estadoVazio)
      if (infoPagina) infoPagina.textContent = 'Página 1 de 1'
      if (infoPaginaBottom) infoPaginaBottom.textContent = 'Página 1 de 1'
      if (btnAnterior) btnAnterior.disabled = true
      if (btnAnteriorBottom) btnAnteriorBottom.disabled = true
      if (btnProxima) btnProxima.disabled = true
      if (btnProximaBottom) btnProximaBottom.disabled = true
      return
    }

    const inicio = (paginaAtual - 1) * CARTAS_POR_PAGINA
    const pagina = cartasExibidas.slice(inicio, inicio + CARTAS_POR_PAGINA)
    const totalPaginas = Math.max(1, Math.ceil(cartasExibidas.length / CARTAS_POR_PAGINA))

    if (infoPagina) infoPagina.textContent = `Página ${paginaAtual} de ${totalPaginas}`
    if (infoPaginaBottom) infoPaginaBottom.textContent = `Página ${paginaAtual} de ${totalPaginas}`
    if (btnAnterior) btnAnterior.disabled = paginaAtual <= 1
    if (btnAnteriorBottom) btnAnteriorBottom.disabled = paginaAtual <= 1
    if (btnProxima) btnProxima.disabled = paginaAtual >= totalPaginas
    if (btnProximaBottom) btnProximaBottom.disabled = paginaAtual >= totalPaginas

    for (let i = 0; i < CARTAS_POR_PAGINA; i++) {
      const carta = pagina[i]
      const slot = document.createElement('div')

      if (carta) {
        if (carta.isPlaceholder) {
          slot.className = 'slot-carta slot-divisoria'
          slot.innerHTML = `<div class="placeholder-text">${carta.edicaoAlvo}</div>`
        } else {
          const temCarta = carta.quantidade > 0
          const classeFaltante = temCarta ? '' : 'carta-faltante'
          const tagFalta = temCarta ? '' : '<div class="badge-falta">Falta</div>'

          const numeroLimpo = carta.numero != null ? carta.numero.toString().trim() : ''
          const urlEdicaoImg = (carta.edicaoBase || carta.edicao || '').toLowerCase()
          const urlImagem = `/cartas/${colecaoAtual}/${urlEdicaoImg}-${numeroLimpo}.jpg`

          const nomeSeguro = (carta.nome || '').replace(/'/g, "\\'").replace(/"/g, '&quot;')

          const tratamento = carta.tratamento || 'normal'
          const classeTratamento = tratamento === 'foil' ? 'efeito-foil' : tratamento === 'etched' ? 'efeito-etched' : ''
          const classePulso = carta.id === ultimaCartaAtualizadaId ? 'pulso' : ''

          slot.className = 'slot-carta'
          slot.innerHTML = `
            <div class="nome-tooltip">${carta.nome} (${carta.edicao})</div>

            <div class="container-imagem ${classeTratamento}" onclick="abrirModal('${urlImagem}', '${nomeSeguro}', '${carta.edicao}')">
                <img class="carta-imagem ${classeFaltante}" src="${urlImagem}" alt="${nomeSeguro}" loading="lazy" onerror="this.onerror=null; this.src='https://cards.scryfall.io/large/front/b/a/badca01d-5f33-4f99-abec-0c302941b6ae.jpg?1686970144';">
            </div>

            ${tagFalta}
            <div class="overlay-controles">
                <button class="btn-qtd" onclick="atualizarQtd('${carta.id}', -1)" aria-label="Diminuir quantidade de ${nomeSeguro}">&minus;</button>
                <span class="qtd-valor ${classePulso}">${carta.quantidade}</span>
                <button class="btn-qtd" onclick="atualizarQtd('${carta.id}', 1)" aria-label="Aumentar quantidade de ${nomeSeguro}">&plus;</button>
                <button class="btn-tratamento" onclick="alternarTratamento('${carta.id}', '${tratamento}')" aria-label="Alterar tratamento de ${nomeSeguro}, atual: ${tratamento}" title="Alterar Tratamento">
                  <span class="pip pip-${tratamento}"></span>
                </button>
            </div>
          `
        }
      } else {
        slot.className = 'slot-carta slot-vazio'
      }

      gridCartas.appendChild(slot)
    }

    ultimaCartaAtualizadaId = null
  }

  const aplicarFiltrosEBusca = () => {
    if (carregando) return

    const termoBusca = inputBusca ? inputBusca.value.toLowerCase() : ''

    let filtradas = cartasOriginais.filter(carta => {
      const matchBusca = carta.nome.toLowerCase().includes(termoBusca) ||
        carta.numero.toString().includes(termoBusca)

      let matchFiltro = true
      if (filtroAtual === 'tenho') matchFiltro = carta.quantidade > 0
      else if (filtroAtual === 'faltam') matchFiltro = carta.quantidade === 0
      else if (filtroAtual.startsWith('edicao-')) {
        const edicaoAlvo = filtroAtual.replace('edicao-', '')
        matchFiltro = carta.edicao === edicaoAlvo
      }

      return matchBusca && matchFiltro
    })

    // Insere divisórias sempre que a edição-base muda, funciona pra qualquer coleção
    if (filtroAtual === 'todas' && termoBusca === '') {
      let resultadoComPlaceholders = []
      let edicaoBaseAnterior = null

      filtradas.forEach(carta => {
        const raiz = (carta.edicaoBase || carta.edicao || '').toUpperCase()

        if (edicaoBaseAnterior !== null && raiz !== edicaoBaseAnterior) {
          resultadoComPlaceholders.push({
            isPlaceholder: true,
            id: `placeholder-divisoria-${raiz}`,
            edicaoAlvo: raiz
          })
        }

        edicaoBaseAnterior = raiz
        resultadoComPlaceholders.push(carta)
      })
      filtradas = resultadoComPlaceholders
    }

    cartasExibidas = filtradas

    const totalPaginas = Math.ceil(cartasExibidas.length / CARTAS_POR_PAGINA)
    if (paginaAtual > totalPaginas && totalPaginas > 0) {
      paginaAtual = totalPaginas
    } else if (totalPaginas === 0) {
      paginaAtual = 1
    }

    atualizarDashboard()
    renderizarGrid()
  }

  const irParaAnterior = () => {
    if (paginaAtual > 1) {
      paginaAtual--
      renderizarGrid()
    }
  }

  const irParaProxima = () => {
    const totalPaginas = Math.ceil(cartasExibidas.length / CARTAS_POR_PAGINA)
    if (paginaAtual < totalPaginas) {
      paginaAtual++
      renderizarGrid()
    }
  }

  if (btnAnterior) btnAnterior.addEventListener('click', irParaAnterior)
  if (btnAnteriorBottom) btnAnteriorBottom.addEventListener('click', irParaAnterior)
  if (btnProxima) btnProxima.addEventListener('click', irParaProxima)
  if (btnProximaBottom) btnProximaBottom.addEventListener('click', irParaProxima)

  if (inputBusca) {
    inputBusca.addEventListener('input', () => {
      paginaAtual = 1
      aplicarFiltrosEBusca()
    })
  }

  if (containerFiltros) {
    containerFiltros.addEventListener('click', (e) => {
      if (e.target.classList.contains('filter-btn') && e.target.id !== 'btn-exportar-ligamagic') {
        document.querySelectorAll('#container-filtros .filter-btn').forEach(b => {
          if (b.id !== 'btn-exportar-ligamagic') b.classList.remove('active')
        })
        e.target.classList.add('active')
        filtroAtual = e.target.getAttribute('data-filter')
        paginaAtual = 1
        aplicarFiltrosEBusca()
      }
    })
  }

  if (btnExportarLiga) {
    btnExportarLiga.addEventListener('click', () => {
      const faltantes = cartasOriginais.filter(carta => carta.quantidade === 0 && !carta.isPlaceholder)

      if (faltantes.length === 0) {
        alert('Nenhuma carta faltando nesta coleção.')
        return
      }

      const conteudoTxt = faltantes.map(carta =>
        `1 ${carta.nome} [Qualidade=SP][Edicao=${carta.edicao}][Idioma=PTEN]`
      ).join('\n')

      const blob = new Blob([conteudoTxt], { type: 'text/plain;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)

      link.setAttribute('href', url)
      link.setAttribute('download', `faltantes-${colecaoAtual || 'colecao'}.txt`)
      link.style.visibility = 'hidden'

      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    })
  }

  carregarColecoes()
})