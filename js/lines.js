/* 영어 음성 문장 — tools/gen-voice.py 가 읽어 assets/voice/<id>.mp3 로 녹음한다. 바꾸면 다시 돌릴 것. */
(function (root, factory) {
  const L = factory();
  if (typeof module === "object" && module.exports) module.exports = L;
  else root.Lines = L;
})(typeof self !== "undefined" ? self : this, function () {
  const NUM = ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"];
  const EN = { pikachu: "Pikachu", bulbasaur: "Bulbasaur", charmander: "Charmander", squirtle: "Squirtle", eevee: "Eevee", jigglypuff: "Jigglypuff", gengar: "Gengar", snorlax: "Snorlax", charizard: "Charizard" };
  const LINES = {
    choose: "Choose your Pokémon!",
    go: "Ready? Go!",
    again: "Roll again!",
    star: "Star!",
    card: "New card!",
    room: "No more room!",
    tie: "It's a tie!",
    steal: "Got it!",
    wall: "Rock wall!",
    flip: "Flip!",
    wrap: "Surrounded!",
    seed: "Plant a seed!",
  };
  NUM.forEach((w, i) => (LINES["n" + (i + 1)] = w + "!"));
  for (const [id, n] of Object.entries(EN)) {
    LINES["turn-" + id] = n + "'s turn!";
    LINES["win-" + id] = n + " wins!";
    LINES["name-" + id] = n + "!";
  }
  return { LINES };
});
