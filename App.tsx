
import React, { useState, useEffect } from 'react';
import { ViewMode, User, Video, Webtoon } from './types';
import { api } from './services/api';
import Auth from './components/Auth';
import VerticalPlayer from './components/VerticalPlayer';
import WebtoonReader from './components/WebtoonReader';
import AdminDashboard from './components/Admin/AdminDashboard';
import HQCine from './components/HQCine';
import VFilm from './components/VFilm';
import HiQua from './components/HiQua';
import MyFavorites from './components/MyFavorites';
import Onboarding, { hasSeenOnboarding } from './components/Onboarding';
import ThemeToggle from './components/ThemeToggle';
import ImageWithFallback from './components/ImageWithFallback';
import SearchOverlay from './components/SearchOverlay';
import AgendaView from './components/AgendaView';
import ConsentBanner from './components/ConsentBanner';
import LegalPolicy from './components/LegalPolicy';
import PrivacyCenter from './components/PrivacyCenter';
import PushPrompt from './components/PushPrompt';
import PushAccountToggle from './components/PushAccountToggle';
import SuperReaderThanks from './components/SuperReaderThanks';
import SuperReaderBadge from './components/SuperReaderBadge';
import { Play, BookOpen, Film, User as UserIcon, ShieldAlert, Sparkles, Search, Heart, Star, Pencil } from 'lucide-react';
import { getLocalizedPrice } from './utils/localizedPrice';
import { initConsent } from './utils/consent';
import { useI18n, useT } from './contexts/I18nContext';
import { LANG_OPTIONS } from './i18n/translations';
import { migrarProgressoDoVisitante } from './utils/claimProgress';
import { parseDeepLink, DeepLink } from './utils/deepLink';
import { parseSuperReaderReturn } from './utils/superReaderReturn';
import { isGuestMode, enterGuestMode, leaveGuestMode } from './utils/guestMode';
import GuestAccountPrompt from './components/GuestAccountPrompt';

const App: React.FC = () => {
  const t = useT();
  const { lang, setLang } = useI18n();
  const [view, setView] = useState<ViewMode>(ViewMode.AUTH);
  const [user, setUser] = useState<User | null>(null);
  const [activeVideo, setActiveVideo] = useState<Video | null>(null);
  const [activeWebtoon, setActiveWebtoon] = useState<Webtoon | null>(null);
  const [activeSeries, setActiveSeries] = useState<any>(null);
  const [seriesEpisodes, setSeriesEpisodes] = useState<any[]>([]);
  const [isOffline, setIsOffline] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [pendingSeriesFocus, setPendingSeriesFocus] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [legalOpen, setLegalOpen] = useState(false);
  const [legalTab, setLegalTab] = useState<'privacy' | 'terms'>('privacy');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  // Retorno do checkout do Super Reader (Fase 4 Bloco 3): true só em
  // ?superreader=success (cancelled limpa a query em silêncio, sem estado).
  const [superReaderThanks, setSuperReaderThanks] = useState(false);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);
  // Deep link de notificação push (?abrir=<seriesId>&tipo=<tipo>): parseado e
  // removido da URL logo no boot (ver useEffect abaixo); fica guardado aqui
  // até existir um `user` para consumir (login OU sessão já restaurada).
  const deepLinkRef = React.useRef<DeepLink | null>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const { avatar } = await api.uploadAvatar(file);
      setUser(prev => (prev ? { ...prev, avatar } : prev));
    } catch (err: any) {
      alert(err?.message || t('account.photoError'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const openPolicy = (tab: 'privacy' | 'terms' = 'privacy') => { setLegalTab(tab); setLegalOpen(true); };

  // URLs públicas /privacidade e /termos abrem o modal legal (funciona
  // deslogado) — exigência da tela de consentimento OAuth do Google, que
  // pede uma URL acessível da política de privacidade.
  useEffect(() => {
    const path = window.location.pathname;
    if (path === '/privacidade') openPolicy('privacy');
    else if (path === '/termos') openPolicy('terms');
  }, []);

  // Limpeza de tokens legados que ficavam no localStorage (agora usamos cookies httpOnly).
  const purgeLegacyTokens = () => {
    localStorage.removeItem('lorflux_session');
    localStorage.removeItem('lorflux_token');
    localStorage.removeItem('lorflux_refresh_token');
  };

  useEffect(() => {
    initConsent();
    purgeLegacyTokens();
    api.setStatusCallback(setIsOffline);
    api.setAuthExpiredCallback(() => {
      setUser(null);
      setView(ViewMode.AUTH);
    });

    // Deep link de push (clique na notificação de capítulo novo): parseia
    // ?abrir=&tipo= e já limpa a URL (history.replaceState) para um reload
    // não reabrir a mesma série. O consumo real (trocar de aba + focar a
    // série) só acontece no useEffect abaixo, quando houver `user`.
    //
    // Mesmo trecho trata o retorno do checkout do Super Reader (Fase 4 Bloco
    // 3): `?superreader=success|cancelled`, gerado pelo success_url/
    // cancel_url de services/superReaderService.js. `success` mostra o
    // cartão de agradecimento; `cancelled` só limpa a query, em silêncio —
    // os dois casos e o deep link de push compartilham a MESMA limpeza de URL
    // (evita dois replaceState em sequência quando, em teoria, os dois
    // parâmetros coexistissem).
    const querySearch = window.location.search;
    const deepLink = parseDeepLink(querySearch);
    if (deepLink) deepLinkRef.current = deepLink;

    const superReaderReturn = parseSuperReaderReturn(querySearch);
    if (superReaderReturn === 'success') setSuperReaderThanks(true);

    if (deepLink || superReaderReturn) {
      const url = new URL(window.location.href);
      url.search = '';
      window.history.replaceState({}, '', url.pathname + url.hash);
    }

    // Restaura a sessão usando o cookie httpOnly de refresh — sem tokens no localStorage.
    //
    // O mesmo guard do handleLogin, pelo mesmo motivo em outra roupagem: com
    // StrictMode (dev), este efeito roda duas vezes — a 1ª execução limpa a
    // URL e o useEffect([user]) consome o deep link (troca para a aba certa),
    // mas o bootstrap da 2ª execução resolvia depois e clobrava com o
    // setView(HQCINE) default. Capturar o pendente ANTES do await decide
    // certo nas duas execuções: o ref sobrevive ao remount do StrictMode,
    // então a 2ª leitura ainda o vê. Em produção (mount único) é inócuo.
    const tinhaDeepLinkPendente = deepLinkRef.current !== null;
    (async () => {
      // Fica true só quando uma sessão de CONTA foi mesmo restaurada — usado
      // no finally abaixo para distinguir esse caminho do modo visitante.
      let sessaoDeContaRestaurada = false;
      try {
        const restored = await api.bootstrapSession();
        if (restored) {
          sessaoDeContaRestaurada = true;
          setUser(restored);
          if (!tinhaDeepLinkPendente) setView(ViewMode.HQCINE);
          if (!hasSeenOnboarding()) setShowOnboarding(true);
        }
      } catch { /* segue para tela de login */ }
      finally {
        // Modo visitante (acesso sem conta): sem sessão de conta restaurada
        // (nem pelo caminho de sucesso acima, nem pelo catch) mas com a flag
        // `lorflux_guest` gravada, pula a tela de login e vai direto pro
        // catálogo — a MESMA experiência de "sem flash de login" que a sessão
        // de conta restaurada já tem acima. Fica no finally (não dentro do
        // try) de propósito: cobre tanto bootstrapSession resolver sem
        // usuário quanto lançar. Ao contrário do ramo de sessão de conta, não
        // olha tinhaDeepLinkPendente — visitante não consome deep link de
        // push (decisão da spec: push exige conta, então não há deep link
        // legítimo pra ele), então não existe aba de deep link pra proteger
        // aqui.
        if (!sessaoDeContaRestaurada && isGuestMode()) setView(ViewMode.HQCINE);
        setBooting(false);
      }
    })();
  }, []);

  // Consome o deep link de push quando `user` vira truthy — cobre tanto o
  // login feito nesta mesma sessão quanto o boot já logado (bootstrapSession
  // acima). Os DOIS caminhos que setam a aba default (bootstrap e handleLogin)
  // capturam `tinhaDeepLinkPendente` de forma síncrona antes dos seus awaits e
  // pulam o setView(HQCINE) default quando havia deep link — sem isso, um
  // setView tardio (StrictMode dobra o bootstrap em dev; a migração atrasa o
  // handleLogin) rodava por cima da aba que este efeito escolheu.
  //
  // Já handleLogin (abaixo) tem um `await` (migração do progresso do
  // visitante) entre o setUser e o setView(HQCINE) default — esse await cede
  // o controle ao event loop, e este efeito pode rodar E CONSUMIR o deep link
  // NESSA janela; quando o await resolve, o setView(HQCINE) default rodaria
  // por cima, perdendo a aba do deep link. handleLogin se protege capturando
  // um flag síncrono (tinhaDeepLinkPendente) ANTES do await, já que checar
  // deepLinkRef.current DEPOIS não distingue "nunca teve deep link" de
  // "efeito já consumiu" — os dois deixam o ref null.
  //
  // Lógica inline (não chama handleSearchSelect, definida mais abaixo no
  // componente, depois dos retornos condicionais de boot/AUTH — referenciá-la
  // aqui quebraria em renders que retornam cedo, antes dela ser atribuída).
  useEffect(() => {
    const deepLink = deepLinkRef.current;
    if (!user || !deepLink) return;
    deepLinkRef.current = null;
    if (deepLink.tipo === 'hiqua') setView(ViewMode.HIQUA);
    else if (deepLink.tipo === 'vcine') setView(ViewMode.VCINE);
    else if (deepLink.tipo === 'hqcine') setView(ViewMode.HQCINE);
    setPendingSeriesFocus(deepLink.seriesId);
  }, [user]);

  const handleLogin = async (u: User) => {
    // Capturado ANTES do setUser e de qualquer await: se havia deep link
    // pendente, o useEffect([user]) acima pode consumi-lo (zerando o ref)
    // durante o await da migração logo abaixo — ler o ref DEPOIS do await não
    // distingue "nunca teve deep link" de "efeito já consumiu" (os dois
    // deixam null). A leitura síncrona aqui resolve isso, e não depende de
    // quando exatamente o efeito dispara.
    const tinhaDeepLinkPendente = deepLinkRef.current !== null;
    setUser(u);
    // A conta substitui o modo visitante (decisão da spec): limpa a flag
    // `lorflux_guest` para não sobrar marcado como visitante quem acabou de
    // logar/cadastrar — não deve haver diferença de tela entre "logou agora"
    // e "reabriu o app já logado".
    leaveGuestMode();
    const tok = (u as any).accessToken;
    if (tok) api.setToken(tok);
    const rtok = (u as any).refreshToken;
    if (rtok) api.setRefreshToken(rtok);
    // Cobre cadastro, login com e-mail/senha e login com Google — os três chegam
    // aqui pelo mesmo onLogin do Auth. Não entra no bootstrapSession (restauração
    // de sessão): ali rodaria em toda abertura do app, e uma vez autenticado o
    // usuário já lê direto na conta, sem acumular nada novo sob o id anônimo.
    //
    // Roda ANTES da troca de tela (de propósito): assim que view vira HQCINE, o
    // ContinueCarousel monta e busca a lista imediatamente — se a troca viesse
    // primeiro, essa busca podia vencer a corrida contra a migração (que no
    // backend processa episódio por episódio) e mostrar a lista vazia bem no
    // momento em que a funcionalidade mais precisa se provar. O prazo interno da
    // própria função evita travar o login numa rede lenta.
    await migrarProgressoDoVisitante();
    // Deep link pendente vence: o useEffect([user]) já trocou de aba pelo tipo
    // certo (e chamou setPendingSeriesFocus) enquanto aguardávamos a migração —
    // não sobrescreve com a aba default.
    if (!tinhaDeepLinkPendente) setView(ViewMode.HQCINE);
    if (!hasSeenOnboarding()) setShowOnboarding(true);
  };

  const openWebtoonEpisode = (ep: any, series: any) => {
    const epId = ep._id || ep.id?.toString();
    setActiveWebtoon({
      id: epId,
      episodeId: epId,
      // Fase 4 (progresso): id real da série/obra, separado do id do episódio acima.
      seriesId: (series?._id || series?.id)?.toString(),
      titulo: ep.title,
      categoria: series.genre,
      descricao: ep.description,
      numeroPaineis: ep.panels?.length ?? 0,
      isPremium: ep.isPremium ?? series.isPremium,
      thumbnailUrl: ep.thumbnail,
      criadoEm: new Date().toISOString()
    });
    setView(ViewMode.READER);
  };

  // Modo visitante (acesso sem conta): entra direto no catálogo, sem senha
  // nem cadastro. Mesma primeira impressão do login — onboarding se nunca visto.
  const handleGuest = () => {
    enterGuestMode();
    setView(ViewMode.HQCINE);
    if (!hasSeenOnboarding()) setShowOnboarding(true);
  };

  const handleLogout = () => {
    api.logout();
    purgeLegacyTokens();
    leaveGuestMode();
    setUser(null);
    setView(ViewMode.AUTH);
  };

  const handleAccountDeleted = () => {
    api.setToken('');
    purgeLegacyTokens();
    leaveGuestMode();
    setUser(null);
    setView(ViewMode.AUTH);
  };

  // Evita "flash" da tela de login enquanto a sessão é restaurada via cookie.
  if (booting) return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[var(--bg-color)]">
      <div className="w-8 h-8 border-2 border-zinc-700 border-t-rose-500 rounded-full animate-spin" />
    </div>
  );

  if (view === ViewMode.AUTH) return (
    <div className="relative">
      <div className="absolute top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <Auth onLogin={handleLogin} onOpenPolicy={openPolicy} onGuest={handleGuest} />
      <ConsentBanner onOpenPolicy={() => openPolicy('privacy')} />
      <LegalPolicy open={legalOpen} onClose={() => setLegalOpen(false)} initialTab={legalTab} />
    </div>
  );

  const handleSearchSelect = (seriesId: string, contentType?: string) => {
    if (contentType === 'hiqua') setView(ViewMode.HIQUA);
    else if (contentType === 'vcine') setView(ViewMode.VCINE);
    else if (contentType === 'hqcine') setView(ViewMode.HQCINE);
    setPendingSeriesFocus(seriesId);
    setSearchOpen(false);
  };

  return (
    <div className="h-screen w-full flex flex-col bg-[var(--bg-color)] text-[var(--text-color)] overflow-hidden font-inter select-none transition-colors duration-300">
      {isOffline && (
        <div className="bg-rose-600 text-white text-[10px] font-black uppercase py-1 text-center tracking-widest z-[5000]">
          {t('common.offline')}
        </div>
      )}

      <button
        onClick={() => setSearchOpen(true)}
        aria-label="Buscar"
        className="fixed top-4 right-4 z-[800] p-3 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-white/70 hover:text-white hover:bg-black/70 transition-all"
        style={{ top: 'max(env(safe-area-inset-top, 0px), 16px)' }}
      >
        <Search size={18} />
      </button>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} onSelectSeries={handleSearchSelect} />

      <AgendaView open={agendaOpen} onClose={() => setAgendaOpen(false)} onOpenSeries={handleSearchSelect} />

      {/* O banner flutuante no topo foi removido a pedido do cliente: sobrepunha o
          conteúdo e ficava pequeno/cortado. A publicidade para usuário free fica nos
          banners de feed (HQCine/VCine/Hi-Qua) e nos interstitials de vídeo/leitura. */}
      <main className="flex-1 overflow-hidden relative">
        {view === ViewMode.HQCINE && (
          <HQCine
            user={user}
            focusSeriesId={pendingSeriesFocus}
            onFocusConsumed={() => setPendingSeriesFocus(null)}
            onOpenAgenda={() => setAgendaOpen(true)}
            onOpen={(ep, series) => {
              setActiveVideo({
                id: (ep._id || ep.id)?.toString(),
                // Fase 4 (progresso): id real da série/obra, separado do id do episódio acima.
                seriesId: series._id,
                titulo: ep.title,
                categoria: series.genre,
                descricao: ep.description,
                duracao: 15,
                arquivoUrl: ep.video_url,
                bunnyVideoId: ep.bunnyVideoId,
                thumbnailUrl: ep.thumbnail,
                isPremium: series.isPremium,
                criadoEm: new Date().toISOString(),
                type: 'hqcine',
                hlsAudioLabels: ep.hlsAudioLabels
              });
              setView(ViewMode.PLAYER);
            }}
          />
        )}

        {view === ViewMode.VCINE && (
          <VFilm
            user={user}
            focusSeriesId={pendingSeriesFocus}
            onFocusConsumed={() => setPendingSeriesFocus(null)}
            onOpenAgenda={() => setAgendaOpen(true)}
            onOpen={(ep, series) => {
              setActiveVideo({
                id: (ep._id || ep.id)?.toString(),
                // Fase 4 (progresso): id real da série/obra, separado do id do episódio acima.
                seriesId: series._id,
                titulo: ep.title,
                categoria: series.genre,
                descricao: ep.description,
                duracao: 10,
                arquivoUrl: ep.video_url,
                bunnyVideoId: ep.bunnyVideoId,
                thumbnailUrl: ep.thumbnail,
                isPremium: series.isPremium,
                criadoEm: new Date().toISOString(),
                type: 'vcine',
                hlsAudioLabels: ep.hlsAudioLabels
              });
              setView(ViewMode.PLAYER);
            }}
          />
        )}

        {view === ViewMode.HIQUA && (
          <HiQua
            user={user}
            focusSeriesId={pendingSeriesFocus}
            onFocusConsumed={() => setPendingSeriesFocus(null)}
            onOpenAgenda={() => setAgendaOpen(true)}
            onOpen={(ep, series, episodes) => {
              setActiveSeries(series);
              setSeriesEpisodes(episodes);
              openWebtoonEpisode(ep, series);
            }}
          />
        )}

        {/* Visitante (view === PROFILE && !user): o convite GuestAccountPrompt
            substitui avatar/nome/e-mail e todo o bloco de ações de conta —
            nada ali (Premium, favoritos, SuperReaderBadge, PushAccountToggle,
            avaliar, sair, PrivacyCenter/LGPD) faz sentido sem conta, e
            SuperReaderBadge/PushAccountToggle consultam a API assim que
            montam, então nem podem montar para visitante. Seletor de idioma
            fica fora do `user &&` de propósito — é útil para os dois; os
            links de privacidade/termos (dentro de PrivacyCenter pro usuário
            real) ganham uma versão mínima equivalente pro visitante logo
            abaixo, reaproveitando o mesmo estilo/rótulos da tela de login
            (auth.privacyLabel/termsLabel) em vez de duplicar o PrivacyCenter
            inteiro (que também exporta dados e exclui conta — não se aplica
            a quem não tem conta). */}
        {view === ViewMode.PROFILE && (
          <div className="p-8 animate-apple max-w-xl mx-auto pt-20 text-center">
            {user ? (
              <>
                <div className="relative inline-block mb-8">
                  <div className={`w-32 h-32 rounded-[3.5rem] border-4 border-white/5 shadow-2xl overflow-hidden ${uploadingAvatar ? 'opacity-50' : ''}`}>
                    <ImageWithFallback src={user?.avatar} className="w-full h-full object-cover" alt={user?.nome || 'Avatar'} />
                  </div>
                  {user?.isPremium && <div className="absolute -bottom-2 -right-2 bg-amber-500 p-2 rounded-full border-4 border-[#0A0A0B]"><Sparkles size={16} className="text-black" /></div>}
                  {/* Troca de foto de perfil */}
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    aria-label={t('account.changePhoto')}
                    className="absolute -top-1 -right-1 p-2.5 bg-rose-600 rounded-full border-4 border-[var(--bg-color)] text-white hover:bg-rose-500 transition-all disabled:opacity-60"
                  >
                    {uploadingAvatar
                      ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <Pencil size={14} />}
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </div>
                <h2 className="text-4xl font-black text-[var(--text-color)] mb-2 tracking-tighter">{user?.nome}</h2>
                <p className="text-zinc-500 font-bold uppercase text-[10px] tracking-widest mb-12">{user?.email}</p>
              </>
            ) : (
              <GuestAccountPrompt onLogin={() => setView(ViewMode.AUTH)} />
            )}

            <div className="space-y-4">
              {user && (
                <>
                  {!user.isPremium && (
                    <button onClick={async () => { try { const { url } = await api.createCheckoutSession(); window.location.href = url; } catch (e) { alert('Erro ao iniciar checkout. Tente novamente.'); } }} className="w-full py-5 bg-amber-500 text-black font-black rounded-3xl hover:scale-[1.02] transition-all">{t('account.subscribePremium')} ({getLocalizedPrice()})</button>
                  )}
                  <button onClick={() => setView(ViewMode.FAVORITES)} className="w-full py-5 bg-white/5 text-[var(--text-color)] font-black rounded-3xl border border-white/10 hover:bg-white/10 transition-all flex items-center justify-center gap-3"><Heart size={18} /> {t('account.myFavorites')}</button>
                  <SuperReaderBadge />
                  <PushAccountToggle />
                  <button
                    onClick={() => window.open('https://play.google.com/store/apps/details?id=com.lorflux.twa', '_blank', 'noopener,noreferrer')}
                    className="w-full py-5 bg-white/5 text-[var(--text-color)] font-black rounded-3xl border border-white/10 hover:bg-white/10 transition-all flex items-center justify-center gap-3"
                  >
                    <Star size={18} /> {t('account.rateApp')}
                  </button>
                  <button onClick={handleLogout} className="w-full py-5 bg-rose-600/10 text-rose-500 font-black rounded-3xl border border-rose-500/20 hover:bg-rose-600/20 transition-all">{t('account.logout')}</button>
                </>
              )}

              {/* Seletor de idioma da interface (compartilhado com os balões do leitor) — vale pra perfil real e convite do visitante */}
              <div className="pt-4">
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3">{t('account.language')}</p>
                <div className="flex justify-center gap-2">
                  {LANG_OPTIONS.map(opt => (
                    <button
                      key={opt.code}
                      onClick={() => setLang(opt.code)}
                      className={`px-5 py-2.5 rounded-2xl text-xs font-black transition-all ${lang === opt.code ? 'bg-rose-600 text-white' : 'bg-white/5 text-zinc-400 border border-white/10 hover:text-white'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {user ? (
              <PrivacyCenter user={user} onOpenPolicy={openPolicy} onDeleted={handleAccountDeleted} />
            ) : (
              <div className="mt-10 text-[10px] text-zinc-600 flex justify-center gap-3">
                <button type="button" onClick={() => openPolicy('privacy')} className="hover:text-rose-500 transition-colors">{t('auth.privacyLabel')}</button>
                <span>·</span>
                <button type="button" onClick={() => openPolicy('terms')} className="hover:text-rose-500 transition-colors">{t('auth.termsLabel')}</button>
              </div>
            )}
          </div>
        )}

        {view === ViewMode.FAVORITES && (
          <MyFavorites user={user} onOpenSeries={handleSearchSelect} />
        )}

        {view === ViewMode.PLAYER && activeVideo && (
          <VerticalPlayer video={activeVideo} user={user} onClose={() => setView(activeVideo.type === 'hqcine' ? ViewMode.HQCINE : ViewMode.VCINE)} />
        )}

        {view === ViewMode.READER && activeWebtoon && (() => {
          const currentIdx = seriesEpisodes.findIndex(e => (e._id || e.id?.toString()) === activeWebtoon.id);
          const prevEp = currentIdx > 0 ? seriesEpisodes[currentIdx - 1] : null;
          const nextEp = currentIdx < seriesEpisodes.length - 1 ? seriesEpisodes[currentIdx + 1] : null;
          return (
            <WebtoonReader
              webtoon={activeWebtoon}
              user={user}
              onClose={() => setView(ViewMode.HIQUA)}
              prevEpisode={prevEp}
              nextEpisode={nextEp}
              onNavigate={(ep) => openWebtoonEpisode(ep, activeSeries)}
            />
          );
        })()}

        {(view === ViewMode.ADMIN_DASHBOARD || view === ViewMode.ADMIN_CONTENT || view === ViewMode.ADMIN_USERS || view === ViewMode.ADMIN_PAYMENTS || view === ViewMode.ADMIN_ADS || view === ViewMode.ADMIN_SETTINGS || view === ViewMode.ADMIN_ROYALTIES) && (
          <AdminDashboard onLogout={handleLogout} currentSubView={view} setSubView={(v) => setView(v)} />
        )}
      </main>

      <nav
        className="bg-[var(--nav-bg,rgba(0,0,0,0.8))] backdrop-blur-3xl border-t border-[var(--border-color)] flex items-center justify-around px-4 pt-4 z-[900]"
        // Edge-to-edge (Android 15/SDK 35): a barra de navegação do sistema
        // sobrepõe a base da página; o respiro cresce com o inset real do
        // aparelho e nunca fica menor que os 2rem originais.
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)' }}
      >
        <NavBtn active={view === ViewMode.HQCINE} onClick={() => setView(ViewMode.HQCINE)} icon={<Play />} label="ANICOM" />
        <NavBtn active={view === ViewMode.VCINE} onClick={() => setView(ViewMode.VCINE)} icon={<Film />} label="V-SHOW" />
        <NavBtn active={view === ViewMode.HIQUA} onClick={() => setView(ViewMode.HIQUA)} icon={<BookOpen />} label="Hi-Qua" />
        <NavBtn active={view === ViewMode.PROFILE || view === ViewMode.FAVORITES} onClick={() => setView(ViewMode.PROFILE)} icon={<UserIcon />} label={t('nav.account')} />
        <ThemeToggle />
        {(user as any)?.role === 'superadmin' && (
          <NavBtn active={view === ViewMode.ADMIN_DASHBOARD} onClick={() => setView(ViewMode.ADMIN_DASHBOARD)} icon={<ShieldAlert />} label="Admin" />
        )}
      </nav>

      {showOnboarding && <Onboarding onFinish={() => setShowOnboarding(false)} />}
      {/* Exclusão mútua com o agradecimento do Super Reader: os dois cartões
          usam a MESMA posição fixa e z-[1600] — sobrepostos, o thanks cobriria
          o prompt por inteiro. Enquanto o thanks está aberto o prompt fica
          desmontado; se um favorito acontecer nessa janela, o convite fica
          para o próximo favorito (a flag só é gravada quando o cartão aparece). */}
      {user && !superReaderThanks && <PushPrompt />}
      {user && superReaderThanks && <SuperReaderThanks onClose={() => setSuperReaderThanks(false)} />}
      <ConsentBanner onOpenPolicy={() => openPolicy('privacy')} />
      <LegalPolicy open={legalOpen} onClose={() => setLegalOpen(false)} initialTab={legalTab} />
    </div>
  );
};

const NavBtn = ({ active, onClick, icon, label }: any) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1.5 transition-all duration-300 ${active ? 'text-rose-500 scale-110' : 'text-zinc-600 hover:text-zinc-400'}`}>
    <div className={`${active ? 'drop-shadow-[0_0_12px_rgba(225,29,72,0.6)]' : ''}`}>{icon}</div>
    <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
  </button>
);

export default App;
