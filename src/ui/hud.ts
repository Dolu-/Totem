/**
 * Ligne d'informations au-dessus du plateau, de sa largeur :
 *   [compteur] niveau      ⏸      score [étoile]
 *   ◀━━━━━━━━━━━ barre de progression ━━━━━━━━━━━
 * Le score est l'information principale, puis le niveau ; la barre se remplit de la
 * droite vers la gauche, vers le niveau. Les libellés « Niveau » et « Score » ne sont pas
 * affichés (icônes) mais restent donnés aux lecteurs d'écran et en infobulle ; de même
 * pour le nombre d'alignements restants. Le DOM n'est modifié que lorsqu'une valeur change.
 */
import type { ProgressUnit } from '../config/tuning.ts';
import type { GameSnapshot } from '../core/game.ts';
import type { Translator } from '../i18n/index.ts';
import { h } from './dom.ts';
import { displayLevel } from './format.ts';
import { icon } from './icons.ts';

export class Hud {
  readonly element: HTMLElement;
  readonly #score = h('div', { class: 'hud__stat hud__stat--score' });
  readonly #level = h('div', { class: 'hud__stat hud__stat--level' });
  readonly #scoreLabel = h('span', { class: 'sr-only' });
  readonly #scoreValue = h('span', { class: 'hud__value', 'data-testid': 'score' });
  readonly #levelLabel = h('span', { class: 'sr-only' });
  readonly #levelValue = h('span', { class: 'hud__value', 'data-testid': 'level' });
  readonly #bar = h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0 });
  readonly #fill = h('div', { class: 'progress__fill' });
  readonly #pause: HTMLButtonElement;
  #t: Translator;
  #last = '';

  constructor(translator: Translator, onPause: () => void) {
    this.#t = translator;
    this.#pause = h('button', { type: 'button', class: 'btn btn--icon hud__pause' }, icon('pause'));
    this.#pause.addEventListener('click', () => {
      // Le bouton ne garde pas le focus : Espace servira à la descente rapide, pas à le recliquer.
      this.#pause.blur();
      onPause();
    });
    this.#level.append(icon('gauge'), this.#levelLabel, this.#levelValue);
    // Étoile à droite du score : ligne symétrique « ⏱ niveau … ⏸ … score ★ ».
    this.#score.append(this.#scoreLabel, this.#scoreValue, icon('star'));
    this.#bar.append(this.#fill);
    this.element = h(
      'header',
      { class: 'hud' },
      this.#level,
      this.#pause,
      this.#score,
      h('div', { class: 'hud__progress' }, this.#bar),
    );
    this.setTranslator(translator);
  }

  setTranslator(translator: Translator): void {
    this.#t = translator;
    this.#scoreLabel.textContent = `${translator.t('hud.score')} `;
    this.#levelLabel.textContent = `${translator.t('hud.level')} `;
    this.#score.title = translator.t('hud.score');
    this.#level.title = translator.t('hud.level');
    this.#bar.setAttribute('aria-label', translator.t('hud.progress'));
    this.#pause.setAttribute('aria-label', translator.t('controls.pause'));
    this.#pause.title = translator.t('controls.pause');
    this.#last = '';
  }

  update(snap: GameSnapshot, unit: ProgressUnit): void {
    const { score, level, toNextLevel, levelProgress } = snap;
    const key = `${score}|${level}|${toNextLevel ?? '-'}|${levelProgress?.done ?? '-'}`;
    if (key === this.#last) return;
    this.#last = key;
    const t = this.#t;
    this.#scoreValue.textContent = t.formatNumber(score);
    this.#levelValue.textContent = String(displayLevel(level));
    if (levelProgress && toNextLevel !== null) {
      const ratio = levelProgress.total > 0 ? levelProgress.done / levelProgress.total : 0;
      // Avancement transmis au CSS : barre horizontale ou verticale selon la disposition.
      this.#fill.style.setProperty('--progress', String(Math.min(1, ratio)));
      this.#bar.setAttribute('aria-valuemax', String(levelProgress.total));
      this.#bar.setAttribute('aria-valuenow', String(levelProgress.done));
      // Texte restitué par les lecteurs d'écran et en infobulle (non affiché).
      const remaining = t.plural(
        unit === 'alignments' ? 'hud.next.alignments' : 'hud.next.blocks',
        toNextLevel,
      );
      this.#bar.setAttribute('aria-valuetext', remaining);
      this.#bar.title = remaining;
    } else {
      this.#fill.style.setProperty('--progress', '1');
      this.#bar.removeAttribute('aria-valuenow');
      this.#bar.setAttribute('aria-valuetext', t.t('hud.maxLevel'));
      this.#bar.title = t.t('hud.maxLevel');
    }
  }
}
