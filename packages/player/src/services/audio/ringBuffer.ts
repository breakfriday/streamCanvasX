class RingBuffer {
  buffer;
  size;
  head;
  tail;
  count;
  constructor(size) {
    this.buffer = new Array(size);
    this.size = size;
    this.head = 0; // 插入数据的位置
    this.tail = 0; // 删除数据的位置
    this.count = 0; // 当前的数据个数
  }

  // 添加单个元素
  enqueue(item) {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.size;
    if (this.count === this.size) {
      this.tail = (this.tail + 1) % this.size; // 如果缓冲区满了，移动tail
    } else {
      this.count++;
    }
  }

  // 批量添加元素
  enqueueBulk(items) {
    for (let item of items) {
      this.enqueue(item);
    }
  }

  // 删除元素
  dequeue() {
    if (this.count === 0) return null; // 缓冲区为空

    let item = this.buffer[this.tail];
    this.buffer[this.tail] = null; // Optional: 清除数据
    this.tail = (this.tail + 1) % this.size;
    this.count--;

    return item;
  }

  // 查看缓冲区是否为空
  isEmpty() {
    return this.count === 0;
  }

  // 查看缓冲区是否已满
  isFull() {
    return this.count === this.size;
  }

  // 获取当前的数据个数
  getCount() {
    return this.count;
  }
}

export default RingBuffer;
