import re

with open('backend/routers/daily_records.py', 'r', encoding='utf-8') as f:
    text = f.read()

old_code_regex = r'    worked = 0\n    extra_worked = 0\n.*?return max\(0, worked - threshold\) \+ extra_worked'

new_code = '''    intervals = []
    if m_in1 is not None and m_out1 is not None and m_in2 is not None and m_out2 is not None:
        intervals.extend([(m_in1, m_out1), (m_in2, m_out2)])
    elif m_in1 is not None and m_out2 is not None and m_out1 is None and m_in2 is None:
        intervals.append((m_in1, m_out2))
    else:
        if m_in1 is not None and m_out1 is not None:
            intervals.append((m_in1, m_out1))
        if m_in2 is not None and m_out2 is not None:
            intervals.append((m_in2, m_out2))

    extra_worked = max(0, m_extra_out - m_extra_in) if m_extra_in is not None and m_extra_out is not None else 0

    if m_extra_in is not None and m_extra_out is not None:
        intervals.append((m_extra_in, m_extra_out))

    valid_intervals = [i for i in intervals if i[1] > i[0]]
    total_worked = 0
    if valid_intervals:
        valid_intervals.sort(key=lambda x: x[0])
        merged = [list(valid_intervals[0])]
        for current in valid_intervals[1:]:
            last = merged[-1]
            if current[0] <= last[1]:
                last[1] = max(last[1], current[1])
            else:
                merged.append(list(current))
        total_worked = sum(e - s for s, e in merged)

    if total_worked <= 0:
        return 0

    if is_weekend:
        return total_worked

    threshold = _DAILY_THRESHOLD.get(category)
    if threshold is None:
        return extra_worked

    return max(0, total_worked - threshold)'''

new_text = re.sub(old_code_regex, new_code, text, flags=re.DOTALL)

with open('backend/routers/daily_records.py', 'w', encoding='utf-8') as f:
    f.write(new_text)

print('Success' if new_text != text else 'Failed to replace')
