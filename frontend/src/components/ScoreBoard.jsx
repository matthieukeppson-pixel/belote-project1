export default function ScoreBoard({ score }) {
  if (!score) return null;

  return (
    <div className="score-board">
      <span>Équipe A : {score.equipeA}</span>
      <span> | </span>
      <span>Équipe B : {score.equipeB}</span>
    </div>
  );
}
