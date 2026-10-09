import { useMemo } from 'react';
import { lintLevel } from '../level/lint';
import { editorStore, useEditor } from '../editor/editor';

/** What the linter finds wrong with the level. Clicking a problem shows the area it is about. */
export function ProblemsPanel() {
    const level = useEditor((state) => state.level);
    const problems = useMemo(() => lintLevel(level), [level]);
    const { focusArea, addBedrockBorder } = editorStore.getState();

    return (
        <section>
            <h2>Problems {problems.length > 0 && <span className='badge'>{problems.length}</span>}</h2>
            {problems.length === 0 && <p className='muted'>None. Both sides can place their tanks.</p>}
            <ul className='problems'>
                {problems.map((problem) => (
                    <li key={problem.message}>
                        {problem.area ? (
                            <button className='link' onClick={() => focusArea(problem.area!)}>
                                {problem.message}
                            </button>
                        ) : (
                            <span>{problem.message}</span>
                        )}
                        {problem.fix === 'bedrock-border' && (
                            <button className='fix' onClick={addBedrockBorder}>
                                Add bedrock border
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
}
