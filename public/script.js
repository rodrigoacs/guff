document.addEventListener('DOMContentLoaded', () => {
  let cartasOriginais = []
  let cartasExibidas = []
  let filtroAtual = 'todas'

  let paginaAtual = 1
  const CARTAS_POR_PAGINA = 36

  const gridCartas = document.getElementById('grid-cartas')
  const inputBusca = document.getElementById('busca')
  const containerFiltros = document.getElementById('container-filtros')
  const btnExportarLiga = document.getElementById('btn-exportar-ligamagic')

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

  const carregarCartas = async () => {
    try {
      const resposta = await fetch('/api/cartas')
      cartasOriginais = await resposta.json()
      gerarBotoesDeEdicao()
      aplicarFiltrosEBusca()
    } catch (error) {
      console.error('Erro ao carregar cartas:', error)
      if (gridCartas) {
        gridCartas.innerHTML = '<p style="color: var(--danger-color); text-align: center; width: 100%; grid-column: 1/-1;">Erro de conexão. Verifique o servidor.</p>'
      }
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
    try {
      const resposta = await fetch(`/api/cartas/${id}`, {
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
        aplicarFiltrosEBusca()
      }
    } catch (error) {
      console.error('Erro ao atualizar quantidade:', error)
    }
  }

  window.alternarTratamento = async (id, tratamentoAtual) => {
    const tratamentos = ['normal', 'foil', 'etched']
    let proximoIndex = (tratamentos.indexOf(tratamentoAtual || 'normal') + 1) % tratamentos.length
    const novoTratamento = tratamentos[proximoIndex]

    try {
      const resposta = await fetch(`/api/cartas/${id}`, {
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
      }
    } catch (error) {
      console.error('Erro ao atualizar tratamento:', error)
    }
  }

  window.abrirModal = (urlSrc, nomeCarta, edicaoCarta) => {
    if (!modal || !imgModal || !legendaModal) return
    imgModal.src = urlSrc
    legendaModal.textContent = `${nomeCarta} (${edicaoCarta})`
    modal.classList.add('mostrar')
  }

  const fecharModal = () => {
    if (!modal || !imgModal || !legendaModal) return
    modal.classList.remove('mostrar')
    setTimeout(() => {
      imgModal.src = ''
      legendaModal.textContent = ''
    }, 300)
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

    if (elTotal) elTotal.textContent = total
    if (elColetadas) elColetadas.textContent = coletadas
    if (elFaltantes) elFaltantes.textContent = faltantes

    if (elProgressBar) {
      elProgressBar.style.width = `${porcentagem}%`
    }
  }

  const atualizarBotoesPaginacao = (totalPaginas) => {
    const desabilitarAnterior = paginaAtual === 1
    const desabilitarProxima = paginaAtual === totalPaginas || totalPaginas === 0

    if (btnAnterior) btnAnterior.disabled = desabilitarAnterior
    if (btnAnteriorBottom) btnAnteriorBottom.disabled = desabilitarAnterior

    if (btnProxima) btnProxima.disabled = desabilitarProxima
    if (btnProximaBottom) btnProximaBottom.disabled = desabilitarProxima

    const texto = `Página ${paginaAtual} de ${totalPaginas || 1}`
    if (infoPagina) infoPagina.textContent = texto
    if (infoPaginaBottom) infoPaginaBottom.textContent = texto
  }

  const renderizarGrid = () => {
    if (!gridCartas) return
    gridCartas.innerHTML = ''

    const totalPaginas = Math.ceil(cartasExibidas.length / CARTAS_POR_PAGINA)
    atualizarBotoesPaginacao(totalPaginas)

    const indiceInicio = (paginaAtual - 1) * CARTAS_POR_PAGINA
    const indiceFim = indiceInicio + CARTAS_POR_PAGINA
    const cartasPagina = cartasExibidas.slice(indiceInicio, indiceFim)

    for (let i = 0; i < CARTAS_POR_PAGINA; i++) {
      const carta = cartasPagina[i]
      const slot = document.createElement('div')

      if (carta) {
        if (carta.isPlaceholder) {
          slot.className = 'slot-carta slot-vazio'
          slot.innerHTML = `<span class="placeholder-text">INÍCIO<br>${carta.edicaoAlvo}</span>`
        } else {
          const temCarta = carta.quantidade > 0
          const classeFaltante = temCarta ? '' : 'carta-faltante'
          const tagFalta = temCarta ? '' : '<div class="badge-falta">Falta</div>'

          const numeroLimpo = carta.numero.toString().trim()
          const numeroAjustado = numeroLimpo.replace(/^(\d+)/, match => match.padStart(3, '0'))

          const urlEdicaoImg = (carta.edicaoBase || carta.edicao).toLowerCase()
          const urlImagem = `/cartas/${urlEdicaoImg}-${numeroLimpo}.jpg`

          const nomeSeguro = carta.nome.replace(/'/g, "\\'").replace(/"/g, '&quot;')

          const tratamento = carta.tratamento || 'normal'
          let classeTratamento = ''
          let iconeTratamento = 'NRM'

          if (tratamento === 'foil') {
            classeTratamento = 'efeito-foil'
            iconeTratamento = 'FOIL'
          } else if (tratamento === 'etched') {
            classeTratamento = 'efeito-etched'
            iconeTratamento = 'ETCH'
          }

          slot.className = 'slot-carta'
          slot.innerHTML = `
            <div class="nome-tooltip">${carta.nome} (${carta.edicao})</div>
            
            <div class="container-imagem ${classeTratamento}" onclick="abrirModal('${urlImagem}', '${nomeSeguro}', '${carta.edicao}')">
                <img class="carta-imagem ${classeFaltante}" src="${urlImagem}" alt="${nomeSeguro}" loading="lazy" onerror="this.onerror=null; this.src='https://cards.scryfall.io/large/front/b/a/badca01d-5f33-4f99-abec-0c302941b6ae.jpg?1686970144';">
            </div>
            
            ${tagFalta}
            <div class="overlay-controles">
                <button class="btn-qtd" onclick="atualizarQtd('${carta.id}', -1)">&minus;</button>
                <span class="qtd-valor">${carta.quantidade}</span>
                <button class="btn-qtd" onclick="atualizarQtd('${carta.id}', 1)">&plus;</button>
                <button class="btn-tratamento" onclick="alternarTratamento('${carta.id}', '${tratamento}')" title="Alterar Tratamento">${iconeTratamento}</button>
            </div>
          `
        }
      } else {
        slot.className = 'slot-carta slot-vazio'
      }

      gridCartas.appendChild(slot)
    }
  }

  const aplicarFiltrosEBusca = () => {
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

    if (filtroAtual === 'todas' && termoBusca === '') {
      let resultadoComPlaceholders = []
      let encontrouLTC = false

      filtradas.forEach(carta => {
        const raiz = (carta.edicaoBase || carta.edicao).toUpperCase()

        if (raiz === 'LTC' && !encontrouLTC) {
          resultadoComPlaceholders.push({
            isPlaceholder: true,
            id: `placeholder-divisoria`,
            edicaoAlvo: 'LTC'
          })
          encontrouLTC = true
        }

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
        alert('Nenhuma carta faltando na sua coleção.')
        return
      }

      // Nova formatação exata que você pediu
      const conteudoTxt = faltantes.map(carta =>
        `1 ${carta.nome} [Qualidade=SP][Edicao=${carta.edicao}][Idioma=PTEN]`
      ).join('\n')

      const blob = new Blob([conteudoTxt], { type: 'text/plain;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)

      link.setAttribute('href', url)
      link.setAttribute('download', 'faltantes-ligamagic.txt')
      link.style.visibility = 'hidden'

      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    })
  }

  carregarCartas()
})