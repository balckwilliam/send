/* global LIMITS */
const html = require('choo/html');
const { bytes } = require('../utils');
const { canceledSignup, submittedSignup } = require('../metrics');

module.exports = function(source) {
  return function(state, emit, close) {
    setTimeout(function() {
      document.getElementById('email-input').focus();
    });
    return html`
    <send-signup-dialog class="flex flex-col p-4">
      <p class="p-8">
        ${state.translate('accountBenefitTitle')}
        <ul class="my-2 leading-normal">
          <li>${state.translate('accountBenefitLargeFiles', {
            size: bytes(LIMITS.MAX_FILE_SIZE)
          })}</li>
          <li>${state.translate('accountBenefitExpiry')}</li>
          <li>${state.translate('accountBenefitSync')}</li>
        </ul>
      </p>
      <form
        onsubmit=${submitEmail}
        data-no-csrf>
        <input
          id="email-input"
          type="text"
          class="border rounded w-full px-2 py-1 h-12 mb-4 text-lg text-grey-darker leading-loose"
          placeholder=${state.translate('emailEntryPlaceholder')}/>
        <input
          class="hidden"
          id="email-submit"
          type="submit"/>
      </form>
      <label class="btn rounded w-full flex flex-no-shrink items-center justify-center" for="email-submit">
        ${state.translate('signInMenuOption')}
      </label>
      <button
        class="my-4 text-blue font-medium"
        title="${state.translate('deletePopupCancel')}"
        onclick=${cancel}>${state.translate('deletePopupCancel')}
      </button>
    </send-signup-dialog>`;

    function emailish(str) {
      if (!str) {
        return false;
      }
      // just check if it's the right shape
      const a = str.split('@');
      return a.length === 2 && a.every(s => s.length > 0);
    }

    function cancel(event) {
      canceledSignup({ source });
      close(event);
    }

    function submitEmail(event) {
      event.preventDefault();
      const el = document.getElementById('email-input');
      const email = el.value;
      submittedSignup({ source });
      emit('login', emailish(email) ? email : null);
    }
  };
};
